import { spawn, type ChildProcess } from 'child_process'
import { statSync } from 'fs'
import { resolveSafe, type ToolDef } from './tools'

// Commandes lancées par le modèle (npm, git, python…), à la demande de l'utilisateur.
// Garde-fous : chaque commande est TOUJOURS montrée et doit être acceptée une par une (même en
// mode autonome) ; elle tourne dans un dossier autorisé ; durée limitée ; arrêtée avec la réponse.

const DEFAULT_TIMEOUT_S = 120
const MAX_TIMEOUT_S = 600
const MAX_OUTPUT = 12_000

export const COMMAND_TOOL_DEFS: ToolDef[] = [
  {
    name: 'run_command',
    description:
      "Exécute une commande dans le terminal (npm install, npm run build, git status, python script.py, tests…) et renvoie sa sortie. L'utilisateur valide chaque commande. Pas de commande interactive ni de serveur qui ne s'arrête pas.",
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Commande complète' },
        cwd: { type: 'string', description: 'Dossier où la lancer (chemin absolu dans un dossier autorisé)' }
      },
      required: ['command', 'cwd']
    }
  }
]

export const COMMAND_TOOL_NAMES = new Set(COMMAND_TOOL_DEFS.map((d) => d.name))

/** Commandes à risque : signalées en rouge dans la demande de validation. */
export const DANGEROUS =
  /\b(format|diskpart|shutdown|reg\s+(delete|add)|bcdedit|mkfs|dd\s+if=|takeown|icacls|Set-ExecutionPolicy)\b|\b(rd|rmdir)\s+\/s|\bdel\s+\/[sfq]|\brm\s+-[a-z]*r|Remove-Item\b.*-Recurse|git\s+(push|reset\s+--hard|clean\s+-[a-z]*f)|npm\s+publish|curl[^|]*\|\s*(sh|bash)|iwr[^|]*\|\s*iex/i

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
  else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}

export interface PreparedCommand {
  command: string
  cwd: string
  dangerous: boolean
}

/** Vérifie la commande avant de demander l'accord (dossier autorisé, commande non vide). */
export function prepareCommand(args: Record<string, unknown>): PreparedCommand {
  const command = String(args.command ?? '').trim()
  if (!command) throw new Error('Commande vide.')
  const cwd = resolveSafe(String(args.cwd ?? '.'))
  if (!statSync(cwd).isDirectory()) throw new Error(`${cwd} n'est pas un dossier.`)
  return { command, cwd, dangerous: DANGEROUS.test(command) }
}

/** Lance la commande acceptée et renvoie sa sortie (tronquée) pour le modèle. */
export function runCommand(p: PreparedCommand, signal: AbortSignal, timeoutS = DEFAULT_TIMEOUT_S): Promise<string> {
  const limit = Math.min(MAX_TIMEOUT_S, Math.max(5, timeoutS))
  return new Promise((resolveOut) => {
    const win = process.platform === 'win32'
    const child = spawn(win ? `chcp 65001 >nul & ${p.command}` : p.command, {
      cwd: p.cwd,
      shell: true,
      windowsHide: true,
      detached: !win,
      // Pas d'entrée : une commande qui attend une réponse ne bloque jamais la conversation.
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' }
    })
    let out = ''
    let note = ''
    const onData = (d: Buffer): void => {
      out = (out + stripAnsi(d.toString('utf-8'))).slice(-MAX_OUTPUT * 2)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    const timer = setTimeout(() => {
      note = `\n(Arrêtée au bout de ${limit} s.)`
      killTree(child)
    }, limit * 1000)
    const onAbort = (): void => {
      note = "\n(Arrêtée par l'utilisateur.)"
      killTree(child)
    }
    signal.addEventListener('abort', onAbort)
    const done = (head: string): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      const text = out.trim()
      resolveOut(`${head}${note}\n${text.length > MAX_OUTPUT ? `…${text.slice(-MAX_OUTPUT)}` : text || '(aucune sortie)'}`)
    }
    child.on('error', (err) => done(`Impossible de lancer la commande : ${err.message}`))
    child.on('close', (code) => done(`Code de sortie ${code ?? '?'}`))
  })
}
