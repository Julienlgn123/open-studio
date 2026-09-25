import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes < 0) return '0 o'
  const k = 1024
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${units[i]}`
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return 'jamais'
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: fr })
}

export function formatDate(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
  return format(d, 'dd MMM yyyy · HH:mm', { locale: fr })
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 1) return '—'
  return formatBytes(bytesPerSec) + '/s'
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m} min ${rs} s`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export function etaFrom(bytesDone: number, bytesTotal: number, speed: number): string {
  if (!speed || bytesDone >= bytesTotal) return '—'
  const remaining = (bytesTotal - bytesDone) / speed
  return formatDuration(remaining * 1000)
}

// Palette fixe : une couleur stable par compte (par ordre de création).
const ACCOUNT_COLORS = [
  '#7c6ff7',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#60a5fa',
  '#f472b6',
  '#a78bfa',
  '#2dd4bf',
  '#fb923c',
  '#c084fc'
]

export function accountColor(index: number): string {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]
}

export type MimeCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'autre'

export function mimeCategory(mime: string): MimeCategory {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation') ||
    mime.startsWith('text/')
  )
    return 'document'
  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('tar') ||
    mime.includes('7z') ||
    mime.includes('gzip')
  )
    return 'archive'
  if (mime.includes('json') || mime.includes('xml') || mime.includes('javascript')) return 'code'
  return 'autre'
}

export const CATEGORY_COLORS: Record<MimeCategory, string> = {
  image: '#34d399',
  video: '#60a5fa',
  audio: '#f472b6',
  document: '#7c6ff7',
  archive: '#fbbf24',
  code: '#2dd4bf',
  autre: '#94a3b8'
}

export function quotaClass(usedRatio: number): string {
  if (usedRatio >= 0.9) return 'crit'
  if (usedRatio >= 0.7) return 'warn'
  return ''
}
