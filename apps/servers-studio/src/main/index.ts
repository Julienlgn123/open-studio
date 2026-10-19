import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { createServer } from 'net'
import { basename, join } from 'path'
import { randomUUID } from 'crypto'
import si from 'systeminformation'
import { host } from '@open-studio/module'
import { kitFetch, notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import type { Detected, LogLine, Project, RunState } from '../shared/types'

// Serveurs locaux : lance les projets de l'utilisateur (bots, sites, scripts) avec la commande
// qu'il a choisie, garde leurs logs, les relance en cas de plantage, et les arrête proprement.

interface Running {
  proc: ChildProcess | null
  state: RunState
  logs: LogLine[]
  stopping: boolean
  restartTimer: NodeJS.Timeout | null
}

const MAX_LOGS = 3000
const runs = new Map<string, Running>()

const projects = (): Project[] => storeGet<Project[]>('projects', [])
const saveProjects = (p: Project[]): void => storeSet('projects', p)

function run(id: string): Running {
  let r = runs.get(id)
  if (!r) {
    r = { proc: null, logs: [], stopping: false, restartTimer: null, state: { id, status: 'stopped', pid: null, startedAt: null, exitCode: null, restarts: 0, url: null } }
    runs.set(id, r)
  }
  return r
}

const pushState = (): void => host.send('servers:states', [...runs.values()].map((r) => r.state))

// Les logs arrivent en rafale : envoyés à l'interface par paquets.
const pendingLogs = new Map<string, LogLine[]>()
let flushTimer: NodeJS.Timeout | null = null
function addLog(id: string, text: string, err: boolean): void {
  const r = run(id)
  for (const raw of text.split(/\r?\n/)) {
    // eslint-disable-next-line no-control-regex
    const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    if (!line.trim()) continue
    const l = { t: Date.now(), text: line, err }
    r.logs.push(l)
    pendingLogs.set(id, [...(pendingLogs.get(id) ?? []), l])
    const m = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d+)?[^\s'"]*)/i.exec(line)
    if (m && !r.state.url) {
      r.state.url = m[1].replace('0.0.0.0', 'localhost')
      pushState()
    }
  }
  if (r.logs.length > MAX_LOGS) r.logs.splice(0, r.logs.length - MAX_LOGS)
  if (!flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = null
      for (const [pid, lines] of pendingLogs) host.send('servers:logs', pid, lines)
      pendingLogs.clear()
    }, 120)
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

function start(id: string): RunState {
  const p = projects().find((x) => x.id === id)
  if (!p) throw new Error('Projet introuvable.')
  const r = run(id)
  if (r.proc) return r.state
  if (!existsSync(p.cwd)) throw new Error(`Le dossier n’existe plus : ${p.cwd}`)
  if (r.restartTimer) clearTimeout(r.restartTimer)
  r.stopping = false
  r.state = { ...r.state, status: 'starting', exitCode: null, url: null, startedAt: Date.now() }
  addLog(id, `▶ ${p.command}   (dans ${p.cwd})`, false)
  const proc = spawn(p.command, { cwd: p.cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, FORCE_COLOR: '0', ...parseEnv(p.env) } })
  r.proc = proc
  r.state.pid = proc.pid ?? null
  proc.stdout?.on('data', (d: Buffer) => {
    if (r.state.status === 'starting') {
      r.state.status = 'running'
      pushState()
    }
    addLog(id, d.toString(), false)
  })
  proc.stderr?.on('data', (d: Buffer) => addLog(id, d.toString(), true))
  proc.on('spawn', () => {
    // Certains programmes n'écrivent rien au démarrage : « démarré » après 1,5 s sans erreur.
    setTimeout(() => {
      if (r.proc === proc && r.state.status === 'starting') {
        r.state.status = 'running'
        pushState()
      }
    }, 1500)
  })
  proc.on('error', (err) => addLog(id, `Impossible de lancer la commande : ${err.message}`, true))
  proc.on('exit', (code) => {
    if (r.proc !== proc) return
    r.proc = null
    r.state.pid = null
    r.state.exitCode = code
    if (r.stopping) {
      r.state.status = 'stopped'
      addLog(id, '■ Arrêté', false)
    } else {
      r.state.status = code === 0 ? 'stopped' : 'crashed'
      if (code !== 0) r.state.lastCrash = Date.now()
      addLog(id, `■ Terminé tout seul (code ${code ?? '?'})`, code !== 0)
      const proj = projects().find((x) => x.id === id)
      if (code !== 0 && proj?.autoRestart) {
        // Relance avec une attente croissante, pour ne pas boucler sur une erreur immédiate.
        const delay = Math.min(60, 2 ** Math.min(r.state.restarts, 5)) * 1000
        r.state.restarts++
        r.state.status = 'restarting'
        addLog(id, `↻ Relance automatique dans ${delay / 1000} s…`, false)
        r.restartTimer = setTimeout(() => {
          try {
            start(id)
          } catch (err) {
            addLog(id, String(err), true)
          }
        }, delay)
      } else if (code !== 0) {
        notify(`${proj?.name ?? 'Un projet'} s’est arrêté`, `Code de sortie ${code}. Ouvre Serveurs locaux pour voir les logs.`)
      }
    }
    pushState()
  })
  pushState()
  return r.state
}

/** Arrêt de tout l'arbre de processus (npm → node → …), sinon les enfants restent en vie. */
function stop(id: string): Promise<RunState> {
  const r = run(id)
  if (r.restartTimer) clearTimeout(r.restartTimer)
  r.restartTimer = null
  r.state.restarts = 0
  if (!r.proc?.pid) {
    r.state.status = 'stopped'
    r.state.usage = null
    pushState()
    return Promise.resolve(r.state)
  }
  r.stopping = true
  const pid = r.proc.pid
  return new Promise((resolve) => {
    const done = (): void => resolve(r.state)
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => setTimeout(done, 300))
    else {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        r.proc?.kill('SIGTERM')
      }
      setTimeout(done, 300)
    }
  })
}

/** Le port est-il libre ? (on essaie de l'ouvrir nous-mêmes un instant) */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, '0.0.0.0', () => srv.close(() => resolve(true)))
  })
}

/** Programme qui occupe un port (Windows : netstat ; ailleurs : lsof). */
function portOwner(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true }, (err, out) => {
        if (err) return resolve(null)
        const line = out.split('\n').find((l) => new RegExp(`:${port}\\s+\\S+\\s+LISTENING`).test(l))
        const pid = line?.trim().split(/\s+/).pop()
        if (!pid) return resolve(null)
        execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (e2, o2) => resolve(e2 ? `PID ${pid}` : `${o2.split(',')[0]?.replace(/"/g, '') || 'programme'} (PID ${pid})`))
      })
    } else {
      execFile('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-n', '-P'], (err, out) => {
        if (err) return resolve(null)
        const l = out.split('\n')[1]?.split(/\s+/)
        resolve(l ? `${l[0]} (PID ${l[1]})` : null)
      })
    }
  })
}

/** CPU et mémoire de chaque projet (son processus et tous ses enfants). */
async function usage(): Promise<void> {
  const active = [...runs.values()].filter((r) => r.state.pid)
  if (!active.length) return
  let list: si.Systeminformation.ProcessesProcessData[]
  try {
    list = (await si.processes()).list
  } catch {
    return
  }
  const children = new Map<number, number[]>()
  for (const p of list) children.set(p.parentPid, [...(children.get(p.parentPid) ?? []), p.pid])
  const byPid = new Map(list.map((p) => [p.pid, p]))
  for (const r of active) {
    const seen = new Set<number>()
    const stack = [r.state.pid!]
    while (stack.length) {
      const pid = stack.pop()!
      if (seen.has(pid)) continue
      seen.add(pid)
      stack.push(...(children.get(pid) ?? []))
    }
    let cpu = 0
    let mem = 0
    for (const pid of seen) {
      const p = byPid.get(pid)
      if (p) {
        cpu += p.cpu
        mem += p.memRss * 1024
      }
    }
    r.state.usage = { cpu: Math.round(cpu * 10) / 10, mem, procs: seen.size }
  }
  pushState()
}

/** Contrôle de santé : l'adresse répond-elle ? Trois échecs d'affilée → relance (si demandé). */
const failures = new Map<string, number>()
async function health(): Promise<void> {
  for (const p of projects()) {
    const r = runs.get(p.id)
    if (!p.health || !r || r.state.status !== 'running') continue
    // Laisse le temps de démarrer.
    if (r.state.startedAt && Date.now() - r.state.startedAt < 20_000) continue
    let ok = false
    try {
      const res = await kitFetch(p.health, { timeoutMs: 8000 })
      ok = res.status < 500
    } catch {
      ok = false
    }
    const before = r.state.healthy
    r.state.healthy = ok
    if (ok) failures.delete(p.id)
    else {
      const n = (failures.get(p.id) ?? 0) + 1
      failures.set(p.id, n)
      if (n === 3) {
        addLog(p.id, `⚠ ${p.health} ne répond plus${p.healthRestart ? ' : relance' : ''}`, true)
        notify(`${p.name} ne répond plus`, p.healthRestart ? 'Relance automatique en cours.' : `${p.health} ne répond pas depuis 1 minute.`)
        if (p.healthRestart) {
          failures.delete(p.id)
          void stop(p.id).then(() => start(p.id))
        }
      }
    }
    if (before !== ok) pushState()
  }
}

/** Commande ponctuelle (npm install, git pull…) : sa sortie va dans les logs du projet. */
function runTask(id: string, command: string): Promise<number> {
  const p = projects().find((x) => x.id === id)
  if (!p) return Promise.reject(new Error('Projet introuvable.'))
  const r = run(id)
  r.state.task = command
  pushState()
  addLog(id, `▶ ${command}`, false)
  return new Promise((resolve) => {
    const proc = spawn(command, { cwd: p.cwd, shell: true, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', ...parseEnv(p.env) } })
    proc.stdout?.on('data', (d: Buffer) => addLog(id, d.toString(), false))
    proc.stderr?.on('data', (d: Buffer) => addLog(id, d.toString(), true))
    proc.on('error', (err) => addLog(id, `Impossible de lancer la commande : ${err.message}`, true))
    proc.on('exit', (code) => {
      addLog(id, `■ ${command} terminé (code ${code ?? '?'})`, code !== 0)
      r.state.task = null
      pushState()
      resolve(code ?? -1)
    })
  })
}

/** Commandes probables d'après le contenu du dossier. */
function detect(dir: string): Detected {
  const files = existsSync(dir) ? readdirSync(dir) : []
  const s: Detected['suggestions'] = []
  if (files.includes('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      const pm = files.includes('pnpm-lock.yaml') ? 'pnpm' : files.includes('yarn.lock') ? 'yarn' : 'npm run'
      for (const k of ['dev', 'start', 'serve', 'bot', 'preview']) if (pkg.scripts?.[k]) s.push({ label: `${k} : ${pkg.scripts[k]}`, command: pm === 'yarn' ? `yarn ${k}` : `${pm} ${k}` })
      if (pkg.main && !s.length) s.push({ label: pkg.main, command: `node ${pkg.main}` })
      return { name: pkg.name ?? basename(dir), suggestions: s }
    } catch {
      /* package.json illisible */
    }
  }
  for (const f of ['main.py', 'bot.py', 'app.py', 'run.py', 'manage.py']) if (files.includes(f)) s.push({ label: f, command: f === 'manage.py' ? 'python manage.py runserver' : `python ${f}` })
  for (const f of ['index.js', 'bot.js', 'server.js', 'app.js']) if (files.includes(f)) s.push({ label: f, command: `node ${f}` })
  if (files.includes('index.html')) s.push({ label: 'Site statique (index.html)', command: 'npx serve .' })
  for (const f of files.filter((x) => /\.(bat|cmd|ps1)$/i.test(x)).slice(0, 3)) s.push({ label: f, command: /\.ps1$/i.test(f) ? `powershell -ExecutionPolicy Bypass -File ${f}` : f })
  return { name: basename(dir), suggestions: s }
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('servers:projects', () => projects())
  ipc.handle('servers:states', () => projects().map((p) => run(p.id).state))
  ipc.handle('servers:logs', (_e, id: string) => run(id).logs)
  ipc.handle('servers:clearLogs', (_e, id: string) => {
    run(id).logs = []
    return true
  })
  ipc.handle('servers:detect', (_e, dir: string) => detect(dir))
  ipc.handle('servers:save', (_e, p: Partial<Project>) => {
    const list = projects()
    const full: Project = {
      id: p.id ?? randomUUID(),
      name: p.name ?? 'Projet',
      cwd: p.cwd ?? '',
      command: p.command ?? '',
      autoStart: !!p.autoStart,
      autoRestart: p.autoRestart ?? true,
      env: p.env ?? '',
      group: p.group?.trim() || undefined,
      port: p.port || null,
      health: p.health?.trim() || undefined,
      healthRestart: !!p.healthRestart,
      tasks: (p.tasks ?? []).filter((t) => t.command.trim())
    }
    saveProjects(list.some((x) => x.id === full.id) ? list.map((x) => (x.id === full.id ? full : x)) : [...list, full])
    return projects()
  })
  ipc.handle('servers:delete', async (_e, id: string) => {
    await stop(id)
    runs.delete(id)
    saveProjects(projects().filter((x) => x.id !== id))
    return projects()
  })
  ipc.handle('servers:start', async (_e, id: string, force?: boolean) => {
    const p = projects().find((x) => x.id === id)
    // Port déjà pris : on prévient au lieu de lancer un serveur qui plantera aussitôt.
    if (p?.port && !force && !run(id).proc && !(await portFree(p.port))) {
      const who = await portOwner(p.port)
      throw new Error(`Le port ${p.port} est déjà utilisé${who ? ` par ${who}` : ''}. Arrête ce programme, ou change le port du projet.`)
    }
    return start(id)
  })
  ipc.handle('servers:startGroup', (_e, group: string) => {
    for (const p of projects().filter((x) => (x.group ?? '') === group)) {
      try {
        start(p.id)
      } catch (err) {
        addLog(p.id, String(err), true)
      }
    }
    return true
  })
  ipc.handle('servers:stopGroup', (_e, group: string) => Promise.all(projects().filter((x) => (x.group ?? '') === group).map((p) => stop(p.id))))
  ipc.handle('servers:stopAll', () => Promise.all([...runs.keys()].map((id) => stop(id))))
  ipc.handle('servers:task', (_e, id: string, command: string) => runTask(id, command))
  ipc.handle('servers:openIn', (_e, id: string, app: 'code' | 'terminal') => {
    const p = projects().find((x) => x.id === id)
    if (!p) return false
    if (app === 'code') spawn('code', ['.'], { cwd: p.cwd, shell: true, detached: true, windowsHide: true }).unref()
    else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${p.cwd}"`], { detached: true, windowsHide: true }).unref()
    else if (process.platform === 'darwin') spawn('open', ['-a', 'Terminal', p.cwd], { detached: true }).unref()
    else spawn('x-terminal-emulator', [], { cwd: p.cwd, detached: true }).unref()
    return true
  })
  ipc.handle('servers:stop', (_e, id: string) => stop(id))
  ipc.handle('servers:restart', async (_e, id: string) => {
    await stop(id)
    return start(id)
  })

  setInterval(() => void usage(), 4000)
  setInterval(() => void health(), 20_000)

  // Lancement avec Open Studio pour les projets cochés.
  for (const p of projects()) if (p.autoStart) setTimeout(() => {
    try {
      start(p.id)
    } catch (err) {
      addLog(p.id, String(err), true)
    }
  }, 1500)
}

export async function deactivate(): Promise<void> {
  await Promise.all([...runs.keys()].map((id) => stop(id)))
}
