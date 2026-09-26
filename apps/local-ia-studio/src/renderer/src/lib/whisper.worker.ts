/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

// Dictée 100 % locale : Whisper tourne dans ce worker (WebAssembly), l'audio ne quitte jamais
// l'ordinateur. Seuls le modèle et le moteur ONNX sont téléchargés une fois, puis gardés en cache.

const MODEL = 'onnx-community/whisper-base'

env.allowLocalModels = false
env.useBrowserCache = true

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>
let transcriber: Promise<Transcriber> | null = null

function load(): Promise<Transcriber> {
  transcriber ??= pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total })
    }
  }) as unknown as Promise<Transcriber>
  return transcriber
}

self.onmessage = async (e: MessageEvent<{ id: number; audio: Float32Array; language?: string }>) => {
  const { id, audio, language } = e.data
  try {
    const asr = await load()
    self.postMessage({ type: 'ready' })
    const out = await asr(audio, { language: language ?? 'french', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
    self.postMessage({ type: 'result', id, text })
  } catch (err) {
    transcriber = null
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
