import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { OsKind } from '@shared/types'

export const OS: OsKind = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'

/** Refus de la demande de droits administrateur (UAC, mot de passe Mac, pkexec). */
export class AdminDeniedError extends Error {
  constructor() {
    super("Droits administrateur refusés")
  }
}

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export function run(file: string, args: string[], opts: { timeoutMs?: number; input?: string } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { windowsHide: true, timeout: opts.timeoutMs ?? 60_000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as NodeJS.ErrnoException).code) : 1) : 0
        resolve({ code, stdout: stdout ?? '', stderr: stderr || (err && !stdout ? err.message : '') })
      }
    )
    if (opts.input !== undefined) child.stdin?.end(opts.input)
  })
}

/** La commande existe dans le PATH (ou au chemin donné). */
export async function hasCommand(cmd: string): Promise<boolean> {
  if (OS === 'windows') return (await run('where', [cmd], { timeoutMs: 5000 })).code === 0
  return (await run('sh', ['-c', `command -v ${cmd}`], { timeoutMs: 5000 })).code === 0
}

function workDir(): string {
  const dir = join(tmpdir(), 'power-studio')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

const PS_PRELUDE = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`

/** PowerShell 5.1 ne lit l'UTF-8 d'un .ps1 correctement qu'avec le BOM. */
function writePs1(script: string): string {
  const file = join(workDir(), `${randomUUID()}.ps1`)
  writeFileSync(file, '﻿' + PS_PRELUDE + script, 'utf8')
  return file
}

/** Exécute un script PowerShell (sans droits admin) et renvoie sa sortie. */
export async function powershell(script: string, timeoutMs = 60_000): Promise<RunResult> {
  const file = writePs1(script)
  try {
    return await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { timeoutMs })
  } finally {
    rmSync(file, { force: true })
  }
}

/** Exécute un script PowerShell qui écrit du JSON sur la sortie, et le décode. */
export async function powershellJson<T>(script: string, timeoutMs = 60_000): Promise<T> {
  const res = await powershell(script, timeoutMs)
  const text = res.stdout.trim()
  if (!text) throw new Error(res.stderr.trim() || `PowerShell a échoué (code ${res.code})`)
  return JSON.parse(text) as T
}

/**
 * Exécute un script PowerShell avec les droits administrateur (une seule fenêtre UAC).
 * Le script reçoit `$OutFile` : tout ce qu'il y écrit (JSON) est renvoyé.
 */
export async function powershellElevated(script: string, timeoutMs = 10 * 60_000): Promise<string> {
  const out = join(workDir(), `${randomUUID()}.out`)
  const file = writePs1(`$OutFile = '${out.replace(/'/g, "''")}'\n${script}`)
  try {
    const launcher = `Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','"${file}"')`
    const res = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcher], { timeoutMs })
    if (res.code !== 0) {
      if (/annul|cancel/i.test(res.stderr)) throw new AdminDeniedError()
      throw new Error(res.stderr.trim() || `Échec (code ${res.code})`)
    }
    return existsSync(out) ? readFileSync(out, 'utf8').replace(/^﻿/, '') : ''
  } finally {
    rmSync(file, { force: true })
    rmSync(out, { force: true })
  }
}

/** Commande shell avec les droits administrateur : mot de passe macOS, ou pkexec sous Linux. */
export async function shellElevated(command: string, timeoutMs = 5 * 60_000): Promise<RunResult> {
  if (OS === 'mac') {
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const res = await run('osascript', ['-e', `do shell script "${escaped}" with administrator privileges`], { timeoutMs })
    if (res.code !== 0 && /-128|annul|cancel/i.test(res.stderr)) throw new AdminDeniedError()
    return res
  }
  const res = await run('pkexec', ['sh', '-c', command], { timeoutMs })
  // 126 : fenêtre fermée / refusée ; 127 : pas d'autorisation.
  if (res.code === 126 || res.code === 127) throw new AdminDeniedError()
  return res
}

/** Échappe une chaîne pour PowerShell entre apostrophes. */
export function psq(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/** Échappe une chaîne pour sh entre apostrophes. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
