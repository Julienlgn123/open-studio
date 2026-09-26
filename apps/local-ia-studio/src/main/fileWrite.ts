import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative, sep } from 'path'
import { app, shell } from 'electron'
import type { ToolApproval } from '@shared/types'
import { display, inside, relativeCandidates, roots, type ToolDef } from './tools'

// Outils d'ÉCRITURE : uniquement dans les dossiers autorisés (même garde-fou que la lecture).
// Chaque action est d'abord « préparée » (vérifications + aperçu), puis appliquée une fois
// acceptée. Les fichiers écrasés ou modifiés sont sauvegardés, les suppressions vont à la corbeille.

const MAX_WRITE_CHARS = 2_000_000
const MAX_PREVIEW_LINES = 160

export const WRITE_TOOL_DEFS: ToolDef[] = [
  {
    name: 'write_file',
    description:
      "Crée un fichier (dossiers parents créés au besoin) ou remplace entièrement son contenu. Pour changer quelques lignes d'un fichier existant, préfère edit_file.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin du fichier (absolu de préférence)' },
        content: { type: 'string', description: 'Contenu complet du fichier' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description:
      "Remplace un passage exact d'un fichier existant par un nouveau texte. old_text doit apparaître une seule fois : copie-le tel quel depuis read_file, avec assez de lignes autour pour être unique.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Fichier à modifier' },
        old_text: { type: 'string', description: 'Passage actuel, recopié exactement' },
        new_text: { type: 'string', description: 'Texte qui le remplace' }
      },
      required: ['path', 'old_text', 'new_text']
    }
  },
  {
    name: 'create_directory',
    description: 'Crée un dossier (et ses parents).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Dossier à créer' } },
      required: ['path']
    }
  },
  {
    name: 'move_path',
    description: 'Déplace ou renomme un fichier ou un dossier. La destination ne doit pas exister.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Chemin actuel' },
        to: { type: 'string', description: 'Nouveau chemin' }
      },
      required: ['from', 'to']
    }
  },
  {
    name: 'delete_path',
    description: "Met un fichier ou un dossier à la corbeille (récupérable par l'utilisateur).",
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Fichier ou dossier à supprimer' } },
      required: ['path']
    }
  }
]

export const WRITE_TOOL_NAMES = new Set(WRITE_TOOL_DEFS.map((d) => d.name))

export interface PreparedWrite {
  approval: Omit<ToolApproval, 'id'>
  /** Effectue l'action et renvoie le compte rendu pour le modèle. */
  apply: () => string | Promise<string>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Résout un chemin (existant ou non) : son plus proche parent existant doit être, une fois
 * les liens résolus, dans un dossier autorisé. Refuse .git et les dossiers autorisés eux-mêmes
 * pour les actions destructrices.
 */
function resolveTarget(input: string): string {
  const allowed = roots()
  if (!allowed.length) throw new Error("Aucun dossier autorisé : l'utilisateur doit en ajouter dans Préférences.")
  const raw = input.trim().replace(/^["']|["']$/g, '')
  if (!raw) throw new Error('Chemin manquant.')

  // Relatif : le premier emplacement où ce chemin (ou son dossier parent) existe déjà, sinon le premier.
  const options = relativeCandidates(raw, allowed)
  const candidate = options.find((c) => existsSync(c)) ?? options.find((c) => existsSync(dirname(c))) ?? options[0]

  // Remonte jusqu'au premier parent existant, puis rattache la partie qui n'existe pas encore.
  let existing = candidate
  const rest: string[] = []
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) break
    rest.unshift(basename(existing))
    existing = parent
  }
  const real = join(realpathSync(existing), ...rest)
  if (!allowed.some((r) => inside(r, real))) throw new Error(`Accès refusé : « ${raw} » est en dehors des dossiers autorisés.`)
  if (real.split(sep).includes('.git')) throw new Error('Modification du dossier .git refusée.')
  return real
}

function assertNotRoot(path: string): void {
  if (roots().some((r) => relative(r, path) === '')) throw new Error('Impossible de toucher à un dossier autorisé lui-même.')
}

/** Copie de sécurité avant d'écraser ou de modifier : userData/sauvegardes/AAAA-MM-JJ/HHMMSS-nom. */
function backup(file: string): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const dir = join(app.getPath('userData'), 'sauvegardes', `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${basename(file)}`)
  copyFileSync(file, dest)
  return dest
}

function readText(file: string): string {
  const buf = readFileSync(file)
  if (buf.subarray(0, 8000).includes(0)) throw new Error(`${display(file)} n'est pas un fichier texte.`)
  return buf.toString('utf-8')
}

/** Diff ligne à ligne (plus longue sous-suite commune) avec 2 lignes de contexte, tronqué. */
export function lineDiff(before: string, after: string): string {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const ops: { t: ' ' | '-' | '+'; line: string }[] = []

  if (midA.length * midB.length > 4_000_000) {
    midA.forEach((line) => ops.push({ t: '-', line }))
    midB.forEach((line) => ops.push({ t: '+', line }))
  } else {
    const n = midA.length
    const m = midB.length
    const lcs = new Int32Array((n + 1) * (m + 1))
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * (m + 1) + j] = midA[i] === midB[j] ? lcs[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1])
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push({ t: ' ', line: midA[i++] })
        j++
      } else if (i < n && (j === m || lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1])) ops.push({ t: '-', line: midA[i++] })
      else ops.push({ t: '+', line: midB[j++] })
    }
  }

  const out: string[] = []
  const ctxBefore = a.slice(Math.max(0, start - 2), start)
  if (start - ctxBefore.length > 0) out.push(`@@ ligne ${start - ctxBefore.length + 1}`)
  ctxBefore.forEach((l) => out.push(`  ${l}`))
  ops.forEach((o) => out.push(`${o.t} ${o.line}`))
  a.slice(endA, endA + 2).forEach((l) => out.push(`  ${l}`))
  if (!ops.some((o) => o.t !== ' ')) return '(contenu identique)'
  return truncate(out)
}

function truncate(lines: string[]): string {
  if (lines.length <= MAX_PREVIEW_LINES) return lines.join('\n')
  return `${lines.slice(0, MAX_PREVIEW_LINES).join('\n')}\n… (${lines.length - MAX_PREVIEW_LINES} lignes de plus)`
}

/** Vérifie une action d'écriture et prépare son aperçu, sans rien toucher sur le disque. */
export function prepareWrite(name: string, args: Record<string, unknown>): PreparedWrite {
  switch (name) {
    case 'write_file': {
      const file = resolveTarget(str(args.path))
      const content = str(args.content)
      if (!content.trim()) throw new Error('content est vide : mets le contenu COMPLET du fichier dans le paramètre content (pas dans ta réponse).')
      if (content.length > MAX_WRITE_CHARS) throw new Error('Contenu trop volumineux (2 Mo max).')
      const exists = existsSync(file)
      if (exists && statSync(file).isDirectory()) throw new Error(`${display(file)} est un dossier.`)
      const before = exists ? readText(file) : null
      // Garde les fins de ligne Windows d'un fichier existant.
      const eol = before?.includes('\r\n') ? '\r\n' : '\n'
      const text = eol === '\r\n' ? content.replace(/\r?\n/g, '\r\n') : content
      return {
        approval: {
          kind: 'write',
          title: exists ? 'Remplacer le contenu de' : 'Créer le fichier',
          path: file,
          preview: before !== null ? lineDiff(before, text) : truncate(content.split(/\r?\n/).map((l) => `+ ${l}`))
        },
        apply: () => {
          const saved = exists ? backup(file) : null
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, text, 'utf-8')
          const lines = text.split(/\r?\n/).length
          return saved
            ? `Fichier ${file} remplacé (${lines} lignes). Original sauvegardé : ${saved}`
            : `Fichier ${file} créé (${lines} lignes).`
        }
      }
    }
    case 'edit_file': {
      const file = resolveTarget(str(args.path))
      if (!existsSync(file)) throw new Error(`Introuvable : ${display(file)}. Pour un nouveau fichier, utilise write_file.`)
      if (statSync(file).isDirectory()) throw new Error(`${display(file)} est un dossier.`)
      const before = readText(file)
      let oldText = str(args.old_text)
      let newText = str(args.new_text)
      if (!oldText) throw new Error('old_text est vide.')
      if (!before.includes(oldText) && before.includes('\r\n')) {
        oldText = oldText.replace(/\r?\n/g, '\r\n')
        newText = newText.replace(/\r?\n/g, '\r\n')
      }
      const count = before.split(oldText).length - 1
      if (count === 0) throw new Error("old_text introuvable dans le fichier : relis-le avec read_file et recopie le passage exactement (espaces et indentation compris).")
      if (count > 1) throw new Error(`old_text apparaît ${count} fois : ajoute des lignes autour pour qu'il soit unique.`)
      const after = before.replace(oldText, () => newText)
      return {
        approval: { kind: 'edit', title: 'Modifier', path: file, preview: lineDiff(before, after) },
        apply: () => {
          const saved = backup(file)
          writeFileSync(file, after, 'utf-8')
          return `Fichier ${file} modifié. Original sauvegardé : ${saved}`
        }
      }
    }
    case 'create_directory': {
      const dir = resolveTarget(str(args.path))
      if (existsSync(dir)) return { approval: { kind: 'mkdir', title: 'Créer le dossier', path: dir, preview: '' }, apply: () => `${dir} existe déjà.` }
      return {
        approval: { kind: 'mkdir', title: 'Créer le dossier', path: dir, preview: '' },
        apply: () => {
          mkdirSync(dir, { recursive: true })
          return `Dossier ${dir} créé.`
        }
      }
    }
    case 'move_path': {
      const from = resolveTarget(str(args.from))
      const to = resolveTarget(str(args.to))
      if (!existsSync(from)) throw new Error(`Introuvable : ${display(from)}.`)
      if (existsSync(to)) throw new Error(`La destination ${display(to)} existe déjà.`)
      assertNotRoot(from)
      if (inside(from, to)) throw new Error('Impossible de déplacer un dossier dans lui-même.')
      return {
        approval: { kind: 'move', title: 'Déplacer', path: from, preview: `→ ${to}` },
        apply: () => {
          mkdirSync(dirname(to), { recursive: true })
          renameSync(from, to)
          return `${from} déplacé vers ${to}.`
        }
      }
    }
    case 'delete_path': {
      const target = resolveTarget(str(args.path))
      if (!existsSync(target)) throw new Error(`Introuvable : ${display(target)}.`)
      assertNotRoot(target)
      const isDir = statSync(target).isDirectory()
      return {
        approval: {
          kind: 'delete',
          title: isDir ? 'Mettre le dossier à la corbeille' : 'Mettre à la corbeille',
          path: target,
          preview: isDir ? 'Le dossier et tout son contenu iront à la corbeille (récupérables).' : 'Le fichier ira à la corbeille (récupérable).'
        },
        apply: async () => {
          await shell.trashItem(target)
          return `${target} mis à la corbeille.`
        }
      }
    }
    default:
      throw new Error(`Outil inconnu : ${name}`)
  }
}
