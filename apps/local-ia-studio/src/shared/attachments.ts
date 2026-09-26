import type { Attachment } from './types'

/** Taille max d'un fichier texte joint (au-delà, le contexte du modèle déborderait de toute façon). */
export const MAX_TEXT_ATTACHMENT_CHARS = 200_000

/** Texte envoyé au modèle : les fichiers texte joints sont insérés avant le message. */
export function contentWithTextAttachments(content: string, attachments?: Attachment[]): string {
  const files = (attachments ?? []).filter((a): a is Extract<Attachment, { kind: 'text' }> => a.kind === 'text')
  if (!files.length) return content
  const blocks = files.map((f) => `Fichier joint « ${f.name} » :\n\`\`\`\n${f.content}\n\`\`\``)
  return `${blocks.join('\n\n')}\n\n${content}`
}

export function imagesOf(attachments?: Attachment[]): string[] {
  return (attachments ?? []).flatMap((a) => (a.kind === 'image' ? [a.data] : []))
}

/** Le texte cite-t-il un chemin absolu situé dans un des dossiers autorisés ? (active l'accès aux fichiers) */
export function mentionsWorkspacePath(text: string, roots: string[]): boolean {
  if (!roots.length) return false
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const paths = text.match(/[A-Za-z]:[\\/][^\n"'`<>|?*]*|(?<![\w.])\/(?:Users|home|Volumes|mnt)\/[^\n"'`<>|?*]*/g) ?? []
  return paths.some((raw) => {
    const p = norm(raw.trim())
    return roots.some((r) => {
      const root = norm(r)
      return p === root || p.startsWith(`${root}/`)
    })
  })
}
