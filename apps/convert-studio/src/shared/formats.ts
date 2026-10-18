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
  { id: 'mp3', label: 'MP3 (audio)', kind: 'audio', ext: 'mp3', args: (q) => ['-vn', '-c:a', 'libmp3lame', '-b:a', ['128k', '192k', '320k'][q]] },
  { id: 'm4a', label: 'M4A / AAC', kind: 'audio', ext: 'm4a', args: (q) => ['-vn', '-c:a', 'aac', '-b:a', ['128k', '192k', '256k'][q]] },
  { id: 'wav', label: 'WAV (sans perte)', kind: 'audio', ext: 'wav', args: () => ['-vn', '-c:a', 'pcm_s16le'] },
  { id: 'ogg', label: 'OGG (audio)', kind: 'audio', ext: 'ogg', args: (q) => ['-vn', '-c:a', 'libvorbis', '-q:a', String([3, 5, 8][q])] },
  { id: 'flac', label: 'FLAC (sans perte)', kind: 'audio', ext: 'flac', args: () => ['-vn', '-c:a', 'flac'] },
  { id: 'png', label: 'PNG', kind: 'image', ext: 'png', args: () => ['-frames:v', '1'] },
  { id: 'jpg', label: 'JPG', kind: 'image', ext: 'jpg', args: (q) => ['-frames:v', '1', '-q:v', String([8, 4, 2][q])] },
  { id: 'webp', label: 'WebP', kind: 'image', ext: 'webp', args: (q) => ['-frames:v', '1', '-quality', String([60, 80, 95][q])] },
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

export interface Job {
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
