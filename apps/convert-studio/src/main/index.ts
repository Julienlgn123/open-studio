import { spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { app } from 'electron'
import { host } from '@open-studio/module'
import { registerKit } from '@open-studio/kit'
import { TARGETS, type Job } from '../shared/formats'

// Convertisseur : ffmpeg (fourni par Open Studio) piloté en ligne de commande, un fichier à la fois.

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let p: string = require('ffmpeg-static')
  if (app.isPackaged) {
    const unpacked = p.replace(`app.asar${require('path').sep}`, `app.asar.unpacked${require('path').sep}`)
    if (existsSync(unpacked)) p = unpacked
  }
  return p
}

/** Nom de sortie libre : « photo.png », sinon « photo (2).png »… */
function freeName(dir: string, base: string, ext: string): string {
  let p = join(dir, `${base}.${ext}`)
  for (let i = 2; existsSync(p); i++) p = join(dir, `${base} (${i}).${ext}`)
  return p
}

const queue: Job[] = []
let current: ChildProcess | null = null
let quality: 0 | 1 | 2 = 1
let outDir: string | null = null

const push = (): void => host.send('convert:jobs', queue)

function run(): void {
  if (current) return
  const job = queue.find((j) => j.status === 'waiting')
  if (!job) return
  const target = TARGETS.find((t) => t.id === job.target)!
  const dir = outDir ?? dirname(job.input)
  const base = basename(job.input, extname(job.input))
  const output = freeName(dir, extname(job.input).slice(1).toLowerCase() === target.ext ? `${base} (converti)` : base, target.ext)
  job.output = output
  job.status = 'running'
  push()

  let duration = 0
  const proc = spawn(ffmpegPath(), ['-hide_banner', '-y', '-i', job.input, ...target.args(quality), output], { windowsHide: true })
  current = proc
  let log = ''
  proc.stderr.on('data', (d: Buffer) => {
    const s = d.toString()
    log = (log + s).slice(-4000)
    const dm = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(s)
    if (dm) duration = +dm[1] * 3600 + +dm[2] * 60 + +dm[3]
    const tm = /time=(\d+):(\d+):(\d+\.\d+)/.exec(s)
    if (tm && duration) {
      job.progress = Math.min(0.99, (+tm[1] * 3600 + +tm[2] * 60 + +tm[3]) / duration)
      push()
    }
  })
  proc.on('close', (code) => {
    current = null
    if (code === 0 && existsSync(output)) {
      job.status = 'done'
      job.progress = 1
      job.outSize = statSync(output).size
    } else if (job.status !== 'error') {
      job.status = 'error'
      const last = log.trim().split('\n').filter((l) => !/^\s*(frame|size|video|audio)/.test(l)).pop() ?? ''
      job.error = /Invalid data|could not find codec|does not contain any stream/i.test(log) ? 'Format non pris en charge ou fichier abîmé.' : last.slice(0, 200) || `ffmpeg a échoué (code ${code})`
    }
    push()
    run()
  })
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('convert:jobs', () => queue)
  ipc.handle('convert:add', (_e, files: { path: string; target: string }[], q: 0 | 1 | 2, dir: string | null) => {
    quality = q
    outDir = dir
    for (const f of files) {
      queue.push({ id: `${Date.now()}-${Math.random()}`, input: f.path, output: null, target: f.target, status: 'waiting', progress: 0, inSize: statSync(f.path).size })
    }
    push()
    run()
    return queue
  })
  ipc.handle('convert:cancel', (_e, id: string) => {
    const job = queue.find((j) => j.id === id)
    if (!job) return queue
    if (job.status === 'running') {
      job.status = 'error'
      job.error = 'Annulé'
      current?.kill()
    } else if (job.status === 'waiting') {
      job.status = 'error'
      job.error = 'Annulé'
    }
    push()
    return queue
  })
  ipc.handle('convert:clear', () => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].status === 'done' || queue[i].status === 'error') queue.splice(i, 1)
    push()
    return queue
  })
}

export function deactivate(): void {
  current?.kill()
}
