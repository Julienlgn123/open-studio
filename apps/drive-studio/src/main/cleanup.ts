import { getFiles } from './db'
import type { DuplicateGroup, FileMeta } from '@shared/types'

// Faire de la place : doublons (même contenu), plus gros fichiers, fichiers jamais modifiés
// depuis longtemps. Rien n'est supprimé ici : l'interface demande confirmation, puis passe par
// la suppression habituelle (corbeille Google Drive).

/**
 * Doublons exacts : même empreinte (SHA-256 pour les fichiers envoyés par l'app, MD5 de Google
 * pour ceux déjà sur le Drive). Probables : même nom et même taille, quand les empreintes ne
 * sont pas comparables (une SHA-256 et un MD5 pour le même fichier).
 */
export function findDuplicates(): DuplicateGroup[] {
  const files = getFiles().filter((f) => f.fileSize > 0)
  const groups: DuplicateGroup[] = []
  const inExact = new Set<string>()
  const byHash = new Map<string, FileMeta[]>()
  for (const f of files) {
    if (!f.checksum) continue
    const list = byHash.get(f.checksum) ?? []
    list.push(f)
    byHash.set(f.checksum, list)
  }
  for (const [key, list] of byHash) {
    if (list.length < 2) continue
    list.forEach((f) => inExact.add(f.id))
    groups.push({ key, exact: true, size: list[0].fileSize, files: sortKeep(list) })
  }
  const byName = new Map<string, FileMeta[]>()
  for (const f of files) {
    const key = `${f.originalFilename.toLowerCase()}|${f.fileSize}`
    const list = byName.get(key) ?? []
    list.push(f)
    byName.set(key, list)
  }
  for (const [key, list] of byName) {
    // Déjà couvert entièrement par un groupe exact : pas la peine de le montrer deux fois.
    if (list.length < 2 || list.every((f) => inExact.has(f.id))) continue
    const hashes = new Set(list.map((f) => f.checksum).filter(Boolean))
    // Empreintes du même type mais différentes : contenus différents, pas un doublon.
    const sameKind = list.every((f) => f.source === list[0].source)
    if (sameKind && hashes.size === list.length) continue
    groups.push({ key, exact: false, size: list[0].fileSize, files: sortKeep(list) })
  }
  // Ce qui libère le plus de place d'abord.
  return groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1))
}

/** Le plus ancien en premier : c'est celui qu'on propose de garder. */
function sortKeep(list: FileMeta[]): FileMeta[] {
  return [...list].sort((a, b) => a.uploadedAt - b.uploadedAt)
}

export function largestFiles(limit = 100): FileMeta[] {
  return getFiles()
    .sort((a, b) => b.fileSize - a.fileSize)
    .slice(0, limit)
}

/** Fichiers non modifiés depuis `days` jours, les plus gros d'abord. */
export function oldFiles(days: number, limit = 200): FileMeta[] {
  const before = Date.now() - days * 86400_000
  return getFiles()
    .filter((f) => (f.modifiedAt || f.uploadedAt) < before)
    .sort((a, b) => b.fileSize - a.fileSize)
    .slice(0, limit)
}

/** Répartition de l'espace par type de fichier. */
export function spaceByType(): { type: string; bytes: number; count: number }[] {
  const cat = (m: string, name: string): string => {
    if (m.startsWith('image/')) return 'Images'
    if (m.startsWith('video/')) return 'Vidéos'
    if (m.startsWith('audio/')) return 'Audio'
    if (/pdf/.test(m)) return 'PDF'
    if (/zip|rar|7z|tar|gzip|compressed/.test(m) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'Archives'
    if (/word|document|text|spreadsheet|excel|presentation|powerpoint|opendocument|google-apps/.test(m)) return 'Documents'
    return 'Autres'
  }
  const map = new Map<string, { bytes: number; count: number }>()
  for (const f of getFiles()) {
    const k = cat(f.mimeType, f.originalFilename)
    const v = map.get(k) ?? { bytes: 0, count: 0 }
    v.bytes += f.fileSize
    v.count++
    map.set(k, v)
  }
  return [...map.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.bytes - a.bytes)
}
