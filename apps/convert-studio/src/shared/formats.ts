// Formats proposés par le Convertisseur, et réglages ffmpeg correspondants.

export type Kind = 'video' | 'audio' | 'image'

export interface Target {
  id: string
  label: string
  kind: Kind
  ext: string
  /** Options ffmpeg de sortie, selon la qualité (0 = petite taille … 2 = meilleure qualité). */
  args: (quality: 0 | 1 | 2) => string[]
}

const crf = (q: number): string => String([32, 26, 20][q])

export const TARGETS: Target[] = [
  { id: 'mp4', label: 'MP4 (vidéo)', kind: 'video', ext: 'mp4', args: (q) => ['-c:v', 'libx264', '-preset', 'medium', '-crf', crf(q), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-pix_fmt', 'yuv420p'] },
  { id: 'webm', label: 'WebM (vidéo)', kind: 'video', ext: 'webm', args: (q) => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String([40, 33, 28][q]), '-c:a', 'libopus'] },
  { id: 'gif', label: 'GIF animé', kind: 'video', ext: 'gif', args: (q) => ['-vf', `fps=${[8, 12, 15][q]},scale=${[360, 480, 640][q]}:-1:flags=lanczos`, '-loop', '0'] },
  { id: 'mkv', label: 'MKV (vidéo)', kind: 'video', ext: 'mkv', args: (q) => ['-c:v', 'libx264', '-preset', 'medium', '-crf', crf(q), '-c:a', 'aac', '-b:a', '192k'] },
  { id: 'mov', label: 'MOV (vidéo Apple)', kind: 'video', ext: 'mov', args: (q) => ['-c:v', 'libx264', '-preset', 'medium', '-crf', crf(q), '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p'] },
  { id: 'mp3', label: 'MP3 (audio)', kind: 'audio', ext: 'mp3', args: (q) => ['-vn', '-c:a', 'libmp3lame', '-b:a', ['128k', '192k', '320k'][q]] },
  { id: 'm4a', label: 'M4A / AAC', kind: 'audio', ext: 'm4a', args: (q) => ['-vn', '-c:a', 'aac', '-b:a', ['128k', '192k', '256k'][q]] },
  { id: 'wav', label: 'WAV (sans perte)', kind: 'audio', ext: 'wav', args: () => ['-vn', '-c:a', 'pcm_s16le'] },
  { id: 'ogg', label: 'OGG (audio)', kind: 'audio', ext: 'ogg', args: (q) => ['-vn', '-c:a', 'libvorbis', '-q:a', String([3, 5, 8][q])] },
  { id: 'opus', label: 'Opus (audio léger)', kind: 'audio', ext: 'opus', args: (q) => ['-vn', '-c:a', 'libopus', '-b:a', ['64k', '96k', '160k'][q]] },
  { id: 'flac', label: 'FLAC (sans perte)', kind: 'audio', ext: 'flac', args: () => ['-vn', '-c:a', 'flac'] },
  { id: 'png', label: 'PNG', kind: 'image', ext: 'png', args: () => ['-frames:v', '1'] },
  { id: 'jpg', label: 'JPG', kind: 'image', ext: 'jpg', args: (q) => ['-frames:v', '1', '-q:v', String([8, 4, 2][q])] },
  { id: 'webp', label: 'WebP', kind: 'image', ext: 'webp', args: (q) => ['-frames:v', '1', '-quality', String([60, 80, 95][q])] },
  { id: 'bmp', label: 'BMP', kind: 'image', ext: 'bmp', args: () => ['-frames:v', '1'] },
  { id: 'tiff', label: 'TIFF', kind: 'image', ext: 'tiff', args: () => ['-frames:v', '1'] },
  { id: 'ico', label: 'ICO (icône)', kind: 'image', ext: 'ico', args: () => ['-frames:v', '1', '-vf', 'scale=256:256:force_original_aspect_ratio=decrease'] }
]

export const INPUT_KIND: Record<string, Kind> = Object.fromEntries([
  ...['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'm4v', '3gp', 'mpeg', 'mpg', 'ts'].map((e) => [e, 'video']),
  ...['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aiff', 'amr'].map((e) => [e, 'audio']),
  ...['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'ico', 'avif', 'heic'].map((e) => [e, 'image'])
]) as Record<string, Kind>

export const extOf = (p: string): string => (p.split('.').pop() ?? '').toLowerCase()

/** Cibles possibles pour un type de fichier source (une vidéo peut aussi donner du son ou une image). */
export function targetsFor(kind: Kind | undefined): Target[] {
  if (kind === 'video') return TARGETS
  if (kind === 'audio') return TARGETS.filter((t) => t.kind === 'audio')
  if (kind === 'image') return TARGETS.filter((t) => t.kind === 'image')
  return []
}

/** Retouches appliquées pendant la conversion (toutes facultatives). */
export interface ConvOpts {
  /** Largeur maximale en pixels (la hauteur suit). */
  width?: number
  /** Découpage, au format 1:30 ou 01:02:03 ou en secondes. */
  start?: string
  end?: string
  rotate?: 0 | 90 | 180 | 270
  flip?: 'h' | 'v'
  speed?: number
  fps?: number
  mute?: boolean
  normalize?: boolean
  /** Volume en pourcentage (100 = inchangé). */
  volume?: number
  /** Taille maximale visée pour une vidéo, en Mo. */
  targetMB?: number
  /** Pour une image tirée d'une vidéo : instant de la capture. */
  frameAt?: string
  stripMeta?: boolean
}

export interface MediaInfo {
  duration: number
  width?: number
  height?: number
  vcodec?: string
  acodec?: string
  fps?: number
  bitrate?: number
}

/** « 1:30 », « 01:02:03.5 » ou « 90 » → secondes. */
export function parseTime(s: string | undefined): number | null {
  if (!s || !s.trim()) return null
  const parts = s.trim().replace(',', '.').split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`
}

export function hasOpts(o: ConvOpts | undefined): boolean {
  return !!o && Object.entries(o).some(([k, v]) => v !== undefined && v !== '' && v !== false && !(k === 'rotate' && v === 0) && !(k === 'speed' && v === 1) && !(k === 'volume' && v === 100))
}

export interface Job {
  opts?: ConvOpts
  id: string
  input: string
  output: string | null
  target: string
  status: 'waiting' | 'running' | 'done' | 'error'
  progress: number
  error?: string
  inSize: number
  outSize?: number
}
