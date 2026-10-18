import { safeStorage } from 'electron'
import { host } from '@open-studio/module'
import { kitFetch, registerKit, storeGet, storeSet } from '@open-studio/kit'
import type { AiSettings, Analysis, Line, Provider, Track, VideoInfo } from '../shared/types'

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
  return {
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

/** Résumé + points clés + flashcards. Les longues vidéos sont d'abord résumées par morceaux. */
async function analyze(title: string, lines: Line[], onStep: (s: string) => void): Promise<Analysis> {
  let text = lines.map((l) => l.text).join(' ')
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
  const r = await chat(
    SYSTEM,
    `Vidéo : « ${title} ».\n${text.length > CHUNK * 1.5 ? 'Notes prises sur la vidéo' : 'Transcription'} :\n\n${text}\n\n` +
      'Réponds UNIQUEMENT avec un objet JSON de la forme {"summary": "résumé en 2 à 4 paragraphes", "points": ["point clé", …] (5 à 10), "cards": [{"q": "question", "a": "réponse courte"}, …] (6 à 12)}.',
    true
  )
  model = r.model
  const start = r.text.indexOf('{')
  const end = r.text.lastIndexOf('}')
  let parsed: Partial<Analysis> = {}
  try {
    parsed = JSON.parse(r.text.slice(start, end + 1))
  } catch {
    return { summary: r.text, points: [], cards: [], model }
  }
  return {
    summary: String(parsed.summary ?? ''),
    points: Array.isArray(parsed.points) ? parsed.points.map(String) : [],
    cards: Array.isArray(parsed.cards) ? parsed.cards.filter((c) => c && c.q && c.a).map((c) => ({ q: String(c.q), a: String(c.a) })) : [],
    model
  }
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('yt:info', (_e, url: string) => getInfo(url))
  ipc.handle('yt:lines', (_e, track: Track, translate?: string) => getLines(track, translate))
  ipc.handle('yt:analyze', (e, title: string, lines: Line[]) => analyze(title, lines, (s) => e.sender.send('yt:step', s)))
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
