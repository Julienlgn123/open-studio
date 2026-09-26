import { app } from 'electron'
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { basename, join, resolve, sep } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { HfDownloadProgress, HfFile, HfModel } from '@shared/types'

const HF = 'https://huggingface.co'

/** Dossier où sont rangés les modèles téléchargés depuis l'app. */
export function modelsDir(): string {
  const dir = join(app.getPath('userData'), 'models')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function isInModelsDir(path: string): boolean {
  return resolve(path).startsWith(resolve(modelsDir()) + sep)
}

export async function searchHfModels(query: string): Promise<HfModel[]> {
  const params = new URLSearchParams({ filter: 'gguf', sort: 'downloads', direction: '-1', limit: '20' })
  if (query.trim()) params.set('search', query.trim())
  const res = await fetch(`${HF}/api/models?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Hugging Face a répondu ${res.status}`)
  const data = (await res.json()) as { id: string; downloads?: number; likes?: number }[]
  return data.map((m) => ({ id: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0 }))
}

const QUANT_RE = /(IQ\d_[A-Z]+|Q\d_K_(?:XL|[SML])|Q\d_K|Q\d_\d|BF16|F16|F32)/i
// Modèles découpés en plusieurs fichiers et projecteurs vision : pas chargeables seuls.
const SKIP_RE = /-\d{5}-of-\d{5}\.gguf$|mmproj/i

export async function listHfGgufFiles(repo: string): Promise<HfFile[]> {
  const res = await fetch(`${HF}/api/models/${repo}/tree/main`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Hugging Face a répondu ${res.status}`)
  const tree = (await res.json()) as { type: string; path: string; size?: number; lfs?: { size?: number } }[]
  return tree
    .filter((f) => f.type === 'file' && f.path.toLowerCase().endsWith('.gguf') && !SKIP_RE.test(f.path))
    .map((f) => {
      const quant = QUANT_RE.exec(f.path)?.[1]?.toUpperCase() ?? null
      return {
        name: f.path,
        sizeBytes: f.lfs?.size ?? f.size ?? 0,
        quant,
        recommended: quant === 'Q4_K_M'
      }
    })
    .sort((a, b) => a.sizeBytes - b.sizeBytes)
}

/**
 * Télécharge un .gguf dans le dossier des modèles. Le fichier est écrit en `.part`
 * puis renommé : un téléchargement interrompu reprend là où il s'était arrêté.
 */
export async function downloadHfFile(
  repo: string,
  file: string,
  onProgress: (p: HfDownloadProgress) => void,
  signal: AbortSignal
): Promise<string | null> {
  const key = `${repo}/${file}`
  const dest = join(modelsDir(), basename(file))
  const part = `${dest}.part`
  const base = { key, repo, file, done: false, error: null, cancelled: false }

  if (existsSync(dest)) {
    const size = statSync(dest).size
    onProgress({ ...base, received: size, total: size, done: true })
    return dest
  }

  try {
    const already = existsSync(part) ? statSync(part).size : 0
    const res = await fetch(`${HF}/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}`, {
      headers: already ? { Range: `bytes=${already}-` } : {},
      signal
    })
    if (!res.ok || !res.body) throw new Error(`Téléchargement échoué (HTTP ${res.status})`)

    // 206 = le serveur reprend à `already` ; 200 = il renvoie tout, on repart de zéro.
    const resumed = res.status === 206
    let received = resumed ? already : 0
    const total = (Number(res.headers.get('content-length') ?? 0) || 0) + received || null

    let lastEmit = 0
    const stream = Readable.fromWeb(res.body as never)
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length
      const now = Date.now()
      if (now - lastEmit > 250) {
        lastEmit = now
        onProgress({ ...base, received, total })
      }
    })
    await pipeline(stream, createWriteStream(part, { flags: resumed ? 'a' : 'w' }), { signal })
    renameSync(part, dest)
    onProgress({ ...base, received, total, done: true })
    return dest
  } catch (err) {
    if (signal.aborted) {
      // Le .part est conservé pour pouvoir reprendre plus tard.
      onProgress({ ...base, received: 0, total: null, done: true, cancelled: true })
      return null
    }
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ ...base, received: 0, total: null, done: true, error: message })
    return null
  }
}
