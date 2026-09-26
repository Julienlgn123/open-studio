// Voix : dictée (micro → texte, Whisper local dans un worker) et lecture à voix haute des
// réponses (voix du système : SAPI sous Windows, voix de macOS…), sans internet.

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
let progressListener: ((pct: number | null) => void) | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  const files = new Map<string, { loaded: number; total: number }>()
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; id?: number; text?: string; message?: string; file?: string; loaded?: number; total?: number }
    if (m.type === 'progress' && m.file) {
      files.set(m.file, { loaded: m.loaded ?? 0, total: m.total ?? 0 })
      const all = [...files.values()]
      const total = all.reduce((n, f) => n + f.total, 0)
      progressListener?.(total ? all.reduce((n, f) => n + f.loaded, 0) / total : null)
    } else if (m.type === 'ready') progressListener?.(null)
    else if (m.type === 'result' && m.id) pending.get(m.id)?.resolve(m.text ?? '')
    else if (m.type === 'error' && m.id) pending.get(m.id)?.reject(new Error(m.message))
    if (m.id && (m.type === 'result' || m.type === 'error')) pending.delete(m.id)
  }
  return worker
}

/** Convertit un enregistrement du micro en échantillons mono 16 kHz (format attendu par Whisper). */
async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (buf.numberOfChannels === 1) return buf.getChannelData(0)
    const a = buf.getChannelData(0)
    const b = buf.getChannelData(1)
    const out = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2
    return out
  } finally {
    void ctx.close()
  }
}

export async function transcribe(blob: Blob, onModelProgress?: (pct: number | null) => void): Promise<string> {
  const audio = await toPcm16k(blob)
  progressListener = onModelProgress ?? null
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, audio, language: 'french' }, [audio.buffer])
  })
}

export interface Recorder {
  stop: () => Promise<Blob>
  cancel: () => void
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start()
  const release = (): void => stream.getTracks().forEach((t) => t.stop())
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release()
          resolve(new Blob(chunks, { type: rec.mimeType }))
        }
        rec.stop()
      }),
    cancel: () => {
      rec.onstop = release
      rec.stop()
    }
  }
}

// ─── Lecture à voix haute ────────────────────────────────────────────────────

/** Texte lisible à l'oral : sans Markdown, blocs de code résumés. */
function speakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' (bloc de code) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Les voix se chargent en arrière-plan : on déclenche le chargement dès l'ouverture de l'app.
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices()

let speakingId: string | null = null

export function isSpeaking(id: string): boolean {
  return speakingId === id && speechSynthesis.speaking
}

export function stopSpeaking(): void {
  speakingId = null
  speechSynthesis.cancel()
}

export function speak(id: string, markdown: string, onEnd: () => void): void {
  stopSpeaking()
  const u = new SpeechSynthesisUtterance(speakable(markdown))
  const voices = speechSynthesis.getVoices()
  u.voice = voices.find((v) => /^fr/i.test(v.lang) && /natural|neural|premium|enhanced/i.test(v.name)) ?? voices.find((v) => /^fr/i.test(v.lang)) ?? null
  u.lang = u.voice?.lang ?? 'fr-FR'
  u.rate = 1.05
  u.onend = u.onerror = () => {
    if (speakingId === id) speakingId = null
    onEnd()
  }
  speakingId = id
  speechSynthesis.speak(u)
}
