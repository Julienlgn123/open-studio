import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { getMessages, getPreferences, listConversations, searchConversations } from './db'
import { SOURCE_LABELS } from '@shared/types'
import type { ApprovalDecision, ToolApproval, WriteMode } from '@shared/types'
import { prepareWrite, WRITE_TOOL_DEFS, WRITE_TOOL_NAMES } from './fileWrite'
import { runWebTool, WEB_TOOL_DEFS, WEB_TOOL_NAMES } from './webTools'

// Outils donnés au modèle quand l'accès aux fichiers est activé : lecture (ici) et,
// selon Préférences, écriture (fileWrite.ts, avec accord de l'utilisateur). Tout chemin est ramené à l'intérieur d'un des dossiers autorisés (Préférences) :
// impossible de sortir avec « .. », un lien symbolique ou un chemin absolu ailleurs.

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', 'dist-installer', '.next', '.nuxt', '.cache', 'coverage',
  '__pycache__', '.venv', 'venv', 'env', 'target', '.idea', '.vscode', '.gradle', 'bin', 'obj', '.turbo'
])
const MAX_READ_CHARS = 40_000
const MAX_SEARCH_FILE_BYTES = 512 * 1024
const MAX_SEARCH_FILES = 4000
const MAX_SEARCH_RESULTS = 60
const MAX_LIST_ENTRIES = 400

export interface ToolDef {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, { type: string; description: string }>; required: string[] }
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_projects',
    description: "Liste les dossiers auxquels tu as accès et leurs sous-dossiers directs (souvent un projet par sous-dossier). À appeler en premier.",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_directory',
    description: "Arborescence d'un dossier (dossiers ignorés : node_modules, .git, dist…). Chemin absolu ou relatif à un dossier autorisé.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dossier à lister' },
        depth: { type: 'number', description: 'Profondeur (1 à 4, défaut 2)' }
      },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Lit un fichier texte (code, config, doc). Pour un gros fichier, précise start_line / end_line.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Fichier à lire' },
        start_line: { type: 'number', description: 'Première ligne (1 = début)' },
        end_line: { type: 'number', description: 'Dernière ligne incluse' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: "Cherche un texte (insensible à la casse) dans les fichiers d'un dossier. Renvoie chemin:ligne: extrait.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texte à chercher' },
        path: { type: 'string', description: 'Dossier où chercher (défaut : tous les dossiers autorisés)' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_conversations',
    description: "Retrouve des passages des anciennes conversations de l'utilisateur (y compris celles importées de Claude, ChatGPT ou Codex).",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Mots-clés à chercher' } },
      required: ['query']
    }
  }
]

export function roots(): string[] {
  return getPreferences().workspaceRoots.filter((r) => existsSync(r)).map((r) => realpathSync(r))
}

export function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Chemins possibles pour un chemin donné par le modèle. « wtest/demo » quand un dossier autorisé
 * s'appelle wtest désigne ce dossier-là, avant d'essayer « <dossier autorisé>/wtest/demo ».
 */
export function relativeCandidates(raw: string, allowed: string[]): string[] {
  if (isAbsolute(raw)) return [resolve(raw)]
  const first = raw.split(/[\\/]/)[0].toLowerCase()
  const named = allowed.filter((r) => basename(r).toLowerCase() === first).map((r) => resolve(dirname(r), raw))
  return [...named, ...allowed.map((r) => resolve(r, raw))]
}

/** Résout un chemin donné par le modèle vers un chemin réel situé dans un dossier autorisé. */
export function resolveSafe(input: string | undefined): string {
  const allowed = roots()
  if (!allowed.length) throw new Error("Aucun dossier autorisé : l'utilisateur doit en ajouter dans Préférences.")
  const raw = (input ?? '').trim().replace(/^["']|["']$/g, '')
  const candidates = !raw || raw === '.' ? [allowed[0]] : relativeCandidates(raw, allowed)
  for (const c of candidates) {
    if (!existsSync(c)) continue
    const real = realpathSync(c)
    if (allowed.some((r) => inside(r, real))) return real
    throw new Error(`Accès refusé : « ${raw} » est en dehors des dossiers autorisés.`)
  }
  throw new Error(`Introuvable : « ${raw} ». Utilise list_projects / list_directory pour voir les chemins existants.`)
}

export function display(path: string): string {
  const root = roots().find((r) => inside(r, path))
  return root ? join(basename(root), relative(root, path)) : path
}

function isProbablyText(buf: Buffer): boolean {
  return !buf.subarray(0, 8000).includes(0)
}

function listDir(dir: string, depth: number, prefix: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
  for (const e of entries) {
    if (out.length >= MAX_LIST_ENTRIES) return
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue
      out.push(`${prefix}${e.name}/`)
      if (depth > 1) listDir(join(dir, e.name), depth - 1, `${prefix}  `, out)
    } else if (e.isFile()) {
      let size = ''
      try {
        const kb = statSync(join(dir, e.name)).size / 1024
        size = kb >= 1024 ? ` (${(kb / 1024).toFixed(1)} Mo)` : ` (${Math.max(1, Math.round(kb))} Ko)`
      } catch {
        /* ignoré */
      }
      out.push(`${prefix}${e.name}${size}`)
    }
  }
}

function* walkFiles(dir: string): Generator<string> {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) yield* walkFiles(full)
    } else if (e.isFile()) yield full
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Outils proposés au modèle selon le mode choisi dans Préférences. */
export function toolDefs(writeMode: WriteMode): ToolDef[] {
  return writeMode === 'read' ? [...TOOL_DEFS, ...WEB_TOOL_DEFS] : [...TOOL_DEFS, ...WRITE_TOOL_DEFS, ...WEB_TOOL_DEFS]
}

export interface ToolContext {
  writeMode: WriteMode
  /** Demande l'accord de l'utilisateur pour une modification (mode « ask »). */
  approve: (req: Omit<ToolApproval, 'id'>) => Promise<ApprovalDecision>
}

/** Exécute un outil ; renvoie toujours du texte (une erreur devient un message que le modèle peut lire). */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  if (WRITE_TOOL_NAMES.has(name)) {
    if (ctx.writeMode === 'read') return "Écriture désactivée : l'utilisateur a choisi la lecture seule (Préférences → Accès aux fichiers)."
    try {
      const prepared = prepareWrite(name, args)
      if (ctx.writeMode === 'ask') {
        const decision = await ctx.approve(prepared.approval)
        if (decision === 'deny') {
          return "L'utilisateur a refusé cette action. Ne la retente pas telle quelle : demande-lui ce qu'il préfère."
        }
      }
      return await prepared.apply()
    } catch (err) {
      return `Erreur : ${err instanceof Error ? err.message : String(err)}`
    }
  }
  if (WEB_TOOL_NAMES.has(name)) return runWebTool(name, args)
  return runReadTool(name, args)
}

function runReadTool(name: string, args: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'list_projects': {
        const allowed = roots()
        if (!allowed.length) return "Aucun dossier autorisé. Demande à l'utilisateur d'en ajouter dans Préférences → Accès aux fichiers."
        return allowed
          .map((r) => {
            const out: string[] = []
            listDir(r, 1, '  ', out)
            return `${r}\n${out.join('\n') || '  (vide)'}`
          })
          .join('\n\n')
      }
      case 'list_directory': {
        const dir = resolveSafe(str(args.path))
        if (!statSync(dir).isDirectory()) return `${display(dir)} est un fichier : utilise read_file.`
        const out: string[] = []
        listDir(dir, Math.min(4, Math.max(1, num(args.depth) ?? 2)), '', out)
        const more = out.length >= MAX_LIST_ENTRIES ? `\n… (liste tronquée à ${MAX_LIST_ENTRIES} entrées, descends dans un sous-dossier)` : ''
        return `${dir}\n${out.join('\n') || '(dossier vide)'}${more}`
      }
      case 'read_file': {
        const file = resolveSafe(str(args.path))
        if (statSync(file).isDirectory()) return `${display(file)} est un dossier : utilise list_directory.`
        const buf = readFileSync(file)
        if (!isProbablyText(buf)) return `${display(file)} n'est pas un fichier texte (binaire, image…).`
        const lines = buf.toString('utf-8').split(/\r?\n/)
        const start = Math.max(1, num(args.start_line) ?? 1)
        const end = Math.min(lines.length, num(args.end_line) ?? lines.length)
        let text = lines.slice(start - 1, end).join('\n')
        let note = ''
        if (text.length > MAX_READ_CHARS) {
          const shown = text.slice(0, MAX_READ_CHARS).split('\n').length
          text = text.slice(0, MAX_READ_CHARS)
          note = `\n… (tronqué : lignes ${start}-${start + shown - 1} sur ${lines.length}, relis avec start_line=${start + shown})`
        }
        return `Fichier ${file} (lignes ${start}-${end} sur ${lines.length})\n${text}${note}`
      }
      case 'search_files': {
        const query = str(args.query).toLowerCase()
        if (!query) return 'Précise query.'
        const bases = str(args.path) ? [resolveSafe(str(args.path))] : roots()
        const results: string[] = []
        let scanned = 0
        outer: for (const b of bases) {
          for (const file of walkFiles(b)) {
            if (++scanned > MAX_SEARCH_FILES) break outer
            try {
              if (statSync(file).size > MAX_SEARCH_FILE_BYTES) continue
              const buf = readFileSync(file)
              if (!isProbablyText(buf)) continue
              const lines = buf.toString('utf-8').split(/\r?\n/)
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(query)) {
                  results.push(`${display(file)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
                  if (results.length >= MAX_SEARCH_RESULTS) break outer
                }
              }
            } catch {
              /* fichier illisible */
            }
          }
        }
        if (!results.length) return `Aucun résultat pour « ${args.query} » (${Math.min(scanned, MAX_SEARCH_FILES)} fichiers parcourus).`
        return results.join('\n') + (results.length >= MAX_SEARCH_RESULTS ? '\n… (résultats tronqués)' : '')
      }
      case 'search_conversations': {
        const query = str(args.query)
        const hits = searchConversations(query).slice(0, 8)
        if (!hits.length) return `Aucune conversation ne parle de « ${query} ».`
        const titles = new Map(listConversations().map((c) => [c.id, c]))
        return hits
          .map((h) => {
            const conv = titles.get(h.conversationId)
            // Quelques messages autour du passage trouvé pour donner du contexte.
            const msgs = getMessages(h.conversationId)
            const idx = msgs.findIndex((m) => m.content.toLowerCase().includes(query.toLowerCase()))
            const around = (idx >= 0 ? msgs.slice(Math.max(0, idx - 1), idx + 2) : msgs.slice(0, 2))
              .map((m) => `  ${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.content.replace(/\s+/g, ' ').slice(0, 600)}`)
              .join('\n')
            const origin = conv?.source ? ` [importée de ${SOURCE_LABELS[conv.source]}]` : ''
            return `« ${conv?.title ?? '?'} »${origin} — ${new Date(conv?.updatedAt ?? 0).toLocaleDateString('fr-FR')}\n${around}`
          })
          .join('\n\n')
      }
      default:
        return `Outil inconnu : ${name}`
    }
  } catch (err) {
    return `Erreur : ${err instanceof Error ? err.message : String(err)}`
  }
}

const shortPath = (p: string): string => p.split(/[\\/]/).slice(-2).join('/')

/** Libellé court affiché dans l'interface pendant que le modèle travaille. */
export function toolLabel(name: string, args: Record<string, unknown>): string {
  const p = str(args.path)
  const short = p ? shortPath(p) : ''
  switch (name) {
    case 'list_projects':
      return 'Liste les projets'
    case 'list_directory':
      return `Explore ${short || 'le dossier'}`
    case 'read_file':
      return `Lit ${short || 'un fichier'}`
    case 'search_files':
      return `Cherche « ${str(args.query)} »`
    case 'search_conversations':
      return `Fouille les conversations : « ${str(args.query)} »`
    case 'write_file':
      return `Écrit ${short || 'un fichier'}`
    case 'edit_file':
      return `Modifie ${short || 'un fichier'}`
    case 'create_directory':
      return `Crée le dossier ${short}`
    case 'move_path':
      return `Déplace ${shortPath(str(args.from))} → ${shortPath(str(args.to))}`
    case 'delete_path':
      return `Met ${short} à la corbeille`
    case 'serve_folder':
      return `Lance le site ${short} sur localhost`
    case 'stop_server':
      return `Arrête le site ${str(args.id)}`
    case 'open_in_browser':
      return `Ouvre ${str(args.url)} dans Chrome`
    default:
      return name
  }
}

export function fileAccessSystemPrompt(writeMode: WriteMode): string {
  const allowed = roots()
  const example = sep === '\\' ? 'ex. cours-studio\\src\\main\\index.ts' : 'ex. cours-studio/src/main/index.ts'
  const head = `Tu as accès aux dossiers de l'utilisateur :
${allowed.map((r) => `- ${r}`).join('\n') || '- (aucun dossier configuré)'}
Lecture : list_projects, list_directory, read_file, search_files, search_conversations.
Quand on te parle de ses projets ou de son code : explore d'abord (list_projects, puis README, package.json, points d'entrée), lis les fichiers utiles, puis réponds concrètement en citant les chemins (${example}).
search_conversations retrouve ce que l'utilisateur a déjà discuté (y compris ses conversations importées de Claude, ChatGPT ou Codex) : utilise-le quand il fait référence au passé.`
  const web = 'Web : serve_folder (sert un dossier de site sur http://localhost, rien à installer), open_in_browser (ouvre une adresse dans Chrome), stop_server.'
  if (writeMode === 'read') {
    return `${head}\n${web}\nTu es en LECTURE SEULE : pour une amélioration, donne le code à changer et où.`
  }
  return `${head}
Écriture : write_file (créer / remplacer un fichier), edit_file (remplacer un passage exact), create_directory, move_path, delete_path (corbeille).
${web}

Tu es un AGENT AUTONOME : quand on te confie une tâche, fais-la entièrement toi-même avec les outils, sans demander de confirmation à chaque étape et sans dire à l'utilisateur de le faire.
- Appelle les outils directement (jamais de JSON d'appel d'outil écrit dans ta réponse).
- Commence par un plan de 2-3 lignes, puis enchaîne les appels jusqu'au résultat final.
- Écris des fichiers COMPLETS et fonctionnels : aucun « ... », aucun « à compléter », aucun placeholder de code.
- Chemins absolus ; lis un fichier avant de le modifier ; edit_file pour changer un fichier existant ; ne touche qu'à ce qui est demandé ; jamais de secrets.
- Site web : crée index.html + style.css + script.js dans le dossier demandé, puis serve_folder sur ce dossier et open_in_browser sur l'adresse obtenue. Vise un rendu professionnel : design moderne et responsive (mobile), belle typographie (Google Fonts), palette cohérente, sections complètes (en-tête avec navigation, hero accrocheur, contenus, témoignages, contact, pied de page), animations CSS discrètes, vraies images (https://images.unsplash.com/photo-… ou https://picsum.photos/seed/<mot>/800/600), textes réalistes en français.${
    writeMode === 'ask' ? "\n- Chaque modification est soumise à l'accord de l'utilisateur ; s'il refuse, demande-lui ce qu'il veut." : ''
  }
- À la fin, résume ce que tu as fait (fichiers créés ou modifiés, adresse du site).`
}
