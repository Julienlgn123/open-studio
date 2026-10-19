import { safeStorage } from 'electron'
import { host } from '@open-studio/module'
import { kitFetch, registerKit, storeGet, storeSet } from '@open-studio/kit'
import type { AiSettings, Analysis, AnalyzeOptions, Chapter, Line, Provider, QA, QuizQuestion, Track, VideoInfo } from '../shared/types'

// Résumé YouTube : transcription d'une vidéo (sous-titres de YouTube, manuels ou automatiques),
// puis résumé, points clés et flashcards par l'IA (Ollama en local, ou Mistral).

const ANDROID = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34 }

export function videoId(input: string): string | null {
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || null
    if (u.searchParams.get('v')) return u.searchParams.get('v')!.slice(0, 11)
    const m = /\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/**
 * Infos et pistes de sous-titres. On passe par l'API du client Android de YouTube : les liens de
 * sous-titres de la page web demandent désormais un jeton que seul un vrai navigateur produit.
 */
async function getInfo(input: string): Promise<VideoInfo> {
  const id = videoId(input)
  if (!id) throw new Error('Ce n’est pas un lien YouTube valide.')
  const res = await kitFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' },
    body: JSON.stringify({ context: { client: { ...ANDROID, hl: 'fr', gl: 'FR' } }, videoId: id })
  })
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status}.`)
  const j = JSON.parse(res.body)
  const status = j.playabilityStatus?.status
  if (status && status !== 'OK') throw new Error(j.playabilityStatus?.reason || 'Vidéo indisponible (privée, supprimée ou réservée).')
  const d = j.videoDetails ?? {}
  const raw: { baseUrl: string; languageCode: string; kind?: string; name?: { runs?: { text: string }[]; simpleText?: string } }[] =
    j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  const tracks: Track[] = raw.map((t) => ({
    lang: t.languageCode,
    name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') ?? t.languageCode,
    auto: t.kind === 'asr',
    url: t.baseUrl
  }))
  const thumbs: { url: string; width: number }[] = d.thumbnail?.thumbnails ?? []
  // Chapitres : les horodatages de la description (« 0:00 Introduction »), s'il y en a au moins 3.
  const chapters: Chapter[] = []
  for (const line of String(d.shortDescription ?? '').split('\n')) {
    const m = /^\s*(?:[-•▶►]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|]?\s*(.+)$/.exec(line)
    if (m) chapters.push({ t: m[1].split(':').reduce((a, n) => a * 60 + Number(n), 0), title: m[2].trim() })
  }
  const okChapters = chapters.length >= 3 && chapters[0].t === 0 ? chapters : undefined
  return {
    chapters: okChapters,
    id,
    title: d.title ?? 'Vidéo YouTube',
    author: d.author ?? '',
    seconds: Number(d.lengthSeconds ?? 0),
    thumbnail: thumbs.sort((a, b) => b.width - a.width)[0]?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    tracks
  }
}

/** Texte horodaté d'une piste (avec traduction automatique de YouTube si `translate`). */
async function getLines(track: Track, translate?: string): Promise<Line[]> {
  const url = `${track.url.replace(/&fmt=[^&]*/, '')}&fmt=json3${translate ? `&tlang=${translate}` : ''}`
  const res = await kitFetch(url)
  if (!res.ok || !res.body) throw new Error('Sous-titres indisponibles pour cette vidéo.')
  const j = JSON.parse(res.body) as { events?: { tStartMs: number; segs?: { utf8: string }[] }[] }
  const lines: Line[] = []
  for (const e of j.events ?? []) {
    const text = (e.segs ?? []).map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim()
    // Les repères seuls (« [Musique] », « [♪♪♪] », « [Applaudissements] ») ne sont pas du texte.
    if (text && !/^\[[^\]]*\]$/.test(text)) lines.push({ t: e.tStartMs / 1000, text })
  }
  if (!lines.length) throw new Error('Les sous-titres de cette vidéo sont vides.')
  return lines
}

// ─── IA ────────────────────────────────────────────────────────────────────────────────────

const settings = (): AiSettings => ({
  provider: 'ollama',
  ollamaModel: '',
  mistralModel: 'mistral-small-latest',
  ...storeGet<Partial<AiSettings>>('ai', {}),
  hasMistralKey: !!storeGet<string | null>('mistralKey', null)
})

function mistralKey(): string | null {
  const v = storeGet<string | null>('mistralKey', null)
  if (!v) return null
  try {
    return safeStorage.decryptString(Buffer.from(v, 'base64'))
  } catch {
    return null
  }
}

async function ollamaModels(): Promise<string[]> {
  try {
    const r = await kitFetch('http://127.0.0.1:11434/api/tags', { timeoutMs: 3000 })
    return (JSON.parse(r.body).models as { name: string }[]).map((m) => m.name).filter((n) => !/embed/i.test(n))
  } catch {
    return []
  }
}

async function chat(system: string, user: string, json: boolean): Promise<{ text: string; model: string }> {
  const s = settings()
  if (s.provider === 'mistral') {
    const key = mistralKey()
    if (!key) throw new Error('Ajoute ta clé Mistral dans les réglages (gratuite sur console.mistral.ai).')
    const r = await kitFetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      timeoutMs: 180_000,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: s.mistralModel, temperature: 0.3, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(json ? { response_format: { type: 'json_object' } } : {}) })
    })
    if (!r.ok) throw new Error(r.status === 401 ? 'Clé Mistral refusée.' : `Mistral a répondu ${r.status} : ${r.body.slice(0, 160)}`)
    return { text: JSON.parse(r.body).choices[0].message.content, model: `Mistral · ${s.mistralModel}` }
  }
  const model = s.ollamaModel || (await ollamaModels())[0]
  if (!model) throw new Error('Ollama ne répond pas ou n’a aucun modèle : installe-le (module Local IA Studio) ou choisis Mistral dans les réglages.')
  let r
  try {
    r = await kitFetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      timeoutMs: 600_000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature: 0.3, num_ctx: 16384 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    })
  } catch {
    throw new Error('Ollama ne répond pas : lance-le, ou choisis Mistral dans les réglages.')
  }
  if (!r.ok) throw new Error(`Ollama a répondu ${r.status}.`)
  return { text: JSON.parse(r.body).message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), model: `Ollama · ${model}` }
}

const SYSTEM =
  'Tu aides un étudiant à retenir le contenu d’une vidéo. Tu réponds toujours en français, de façon claire et fidèle à la vidéo, sans inventer.'

const LENGTHS = { short: 'en 1 paragraphe court', normal: 'en 2 à 4 paragraphes', long: 'de façon détaillée, en 5 à 8 paragraphes' }
const STYLES = {
  summary: 'un résumé fidèle',
  revision: 'une fiche de révision structurée (définitions, idées principales, exemples, à retenir), en Markdown avec titres ## et listes',
  outline: 'un plan de cours détaillé (parties I, II, III avec sous-parties A, B), en Markdown',
  tweet: 'un résumé ultra court et percutant, comme un fil de 3 à 5 messages'
}

function compact(lines: Line[]): string {
  return lines.map((l) => l.text).join(' ')
}

/** Résumé + points clés + flashcards. Les longues vidéos sont d'abord résumées par morceaux. */
async function analyze(title: string, lines: Line[], opts: AnalyzeOptions, onStep: (s: string) => void): Promise<Analysis> {
  let text = compact(lines)
  const CHUNK = 12_000
  let model = ''
  if (text.length > CHUNK * 1.5) {
    const parts: string[] = []
    for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK))
    const notes: string[] = []
    for (let i = 0; i < parts.length; i++) {
      onStep(`Lecture de la vidéo (${i + 1}/${parts.length})…`)
      const r = await chat(SYSTEM, `Partie ${i + 1}/${parts.length} de la transcription de « ${title} ». Prends des notes détaillées (puces) de tout ce qui est expliqué :\n\n${parts[i]}`, false)
      notes.push(r.text)
      model = r.model
    }
    text = notes.join('\n\n')
  }
  onStep('Rédaction du résumé…')
  const lang = opts.lang === 'en' ? 'Write everything (summary, points, cards) in English.' : 'Tout en français.'
  const r = await chat(
    SYSTEM,
    `Vidéo : « ${title} ».\n${text.length > CHUNK * 1.5 ? 'Notes prises sur la vidéo' : 'Transcription'} :\n\n${text}\n\n` +
      `Dans "summary", écris ${STYLES[opts.style]}, ${LENGTHS[opts.length]}. ${lang}\n` +
      'Réponds UNIQUEMENT avec un objet JSON de la forme {"summary": "…", "points": ["point clé", …] (5 à 10), "cards": [{"q": "question", "a": "réponse courte"}, …] (6 à 12)}.',
    true
  )
  model = r.model
  const parsed = parseJson<Partial<Analysis>>(r.text)
  if (!parsed) return { summary: r.text, points: [], cards: [], model }
  return {
    summary: String(parsed.summary ?? ''),
    points: Array.isArray(parsed.points) ? parsed.points.map(String) : [],
    cards: Array.isArray(parsed.cards) ? parsed.cards.filter((c) => c && c.q && c.a).map((c) => ({ q: String(c.q), a: String(c.a) })) : [],
    model
  }
}

function parseJson<T>(text: string): T | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Passages de la transcription les plus utiles pour une question (mots en commun), avec leur
 * horodatage, dans la limite du budget : la vidéo entière si elle tient.
 */
function relevant(lines: Line[], question: string, budget = 36_000): string {
  const full = lines.map((l) => `[${clock(l.t)}] ${l.text}`)
  if (full.join('\n').length <= budget) return full.join('\n')
  const words = new Set(question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) ?? [])
  const score = lines.map((l) => {
    const w = l.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) ?? []
    return w.filter((x) => words.has(x)).length
  })
  const keep = new Set<number>()
  let size = 0
  for (const i of [...score.keys()].sort((a, b) => score[b] - score[a])) {
    for (let j = Math.max(0, i - 6); j <= Math.min(lines.length - 1, i + 6); j++) {
      if (keep.has(j)) continue
      keep.add(j)
      size += full[j].length
    }
    if (size > budget) break
  }
  return [...keep].sort((a, b) => a - b).map((i) => full[i]).join('\n')
}

async function ask(title: string, lines: Line[], question: string, previous: QA[]): Promise<string> {
  const context = relevant(lines, question)
  const prev = previous
    .slice(-4)
    .map((x) => `Question : ${x.q}\nRéponse : ${x.a}`)
    .join('\n\n')
  const r = await chat(
    `${SYSTEM} Tu réponds uniquement d’après la transcription fournie. Si la vidéo n’en parle pas, dis-le. Cite les moments utiles sous la forme [m:ss].`,
    `Vidéo : « ${title} ». Transcription horodatée :\n\n${context}\n\n${prev ? `Échanges précédents :\n${prev}\n\n` : ''}Question : ${question}`,
    false
  )
  return r.text
}

async function quiz(title: string, lines: Line[], count: number): Promise<QuizQuestion[]> {
  let text = compact(lines)
  if (text.length > 30_000) text = text.slice(0, 30_000)
  const r = await chat(
    SYSTEM,
    `Vidéo : « ${title} ». Transcription :\n\n${text}\n\nCrée un quiz de ${count} questions à choix multiples pour vérifier la compréhension. ` +
      'Réponds UNIQUEMENT avec un objet JSON {"questions": [{"q": "question", "choices": ["A", "B", "C", "D"], "answer": index de la bonne réponse (0 à 3), "why": "explication courte"}]}.',
    true
  )
  const parsed = parseJson<{ questions?: QuizQuestion[] }>(r.text)
  const list = (parsed?.questions ?? []).filter((x) => x && x.q && Array.isArray(x.choices) && x.choices.length >= 2 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length)
  if (!list.length) throw new Error('L’IA n’a pas produit de quiz utilisable : réessaie, ou choisis un modèle plus grand.')
  return list.map((x) => ({ q: String(x.q), choices: x.choices.map(String), answer: x.answer, why: x.why ? String(x.why) : undefined }))
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('yt:info', (_e, url: string) => getInfo(url))
  ipc.handle('yt:lines', (_e, track: Track, translate?: string) => getLines(track, translate))
  ipc.handle('yt:analyze', (e, title: string, lines: Line[], opts?: AnalyzeOptions) =>
    analyze(title, lines, { length: 'normal', style: 'summary', lang: 'fr', ...opts }, (s) => e.sender.send('yt:step', s))
  )
  ipc.handle('yt:ask', (_e, title: string, lines: Line[], question: string, previous: QA[]) => ask(title, lines, question, previous ?? []))
  ipc.handle('yt:quiz', (_e, title: string, lines: Line[], count: number) => quiz(title, lines, count ?? 8))
  ipc.handle('yt:settings', () => settings())
  ipc.handle('yt:models', () => ollamaModels())
  ipc.handle('yt:setSettings', (_e, patch: Partial<AiSettings> & { provider?: Provider }) => {
    const { hasMistralKey: _, ...rest } = { ...settings(), ...patch }
    storeSet('ai', rest)
    return settings()
  })
  ipc.handle('yt:setMistralKey', (_e, key: string) => {
    storeSet('mistralKey', key ? safeStorage.encryptString(key.trim()).toString('base64') : null)
    return settings()
  })
}
