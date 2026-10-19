import { spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, unlinkSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { Notification, app } from 'electron'
import { host } from '@open-studio/module'
import { registerKit } from '@open-studio/kit'
import { TARGETS, parseTime, type ConvOpts, type Job, type MediaInfo, type Target } from '../shared/formats'

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

/** Infos d'un fichier, lues dans la sortie de « ffmpeg -i ». */
export function probe(path: string): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-i', path], { windowsHide: true })
    let log = ''
    proc.stderr.on('data', (d: Buffer) => (log += d.toString()))
    proc.on('close', () => {
      const info: MediaInfo = { duration: 0 }
      const dm = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log)
      if (dm) info.duration = +dm[1] * 3600 + +dm[2] * 60 + +dm[3]
      const br = /bitrate: (\d+) kb\/s/.exec(log)
      if (br) info.bitrate = Number(br[1])
      const v = /Stream #[^\n]*Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})[^\n]*?(?:, ([\d.]+) fps)?/.exec(log)
      if (v) {
        info.vcodec = v[1]
        info.width = Number(v[2])
        info.height = Number(v[3])
        if (v[4]) info.fps = Number(v[4])
      }
      const a = /Stream #[^\n]*Audio: (\w+)/.exec(log)
      if (a) info.acodec = a[1]
      resolve(info)
    })
    proc.on('error', () => resolve({ duration: 0 }))
  })
}

/** Ajoute nos filtres à ceux que la cible impose déjà (-vf / -af). */
function mergeFilter(args: string[], flag: '-vf' | '-af', filters: string[]): string[] {
  if (!filters.length) return args
  const i = args.indexOf(flag)
  if (i >= 0) {
    const out = [...args]
    out[i + 1] = `${filters.join(',')},${out[i + 1]}`
    return out
  }
  return [...args, flag, filters.join(',')]
}

/** atempo n'accepte que 0,5 à 2 : on enchaîne pour aller au-delà. */
function atempo(speed: number): string[] {
  const out: string[] = []
  let s = speed
  while (s > 2) {
    out.push('atempo=2')
    s /= 2
  }
  while (s < 0.5) {
    out.push('atempo=0.5')
    s /= 0.5
  }
  out.push(`atempo=${s.toFixed(4)}`)
  return out
}

export function buildArgs(input: string, output: string, target: Target, q: 0 | 1 | 2, o: ConvOpts, info: MediaInfo): string[] {
  const pre: string[] = ['-hide_banner', '-y']
  const start = parseTime(o.start)
  const end = parseTime(o.end)
  if (target.kind === 'image' && info.duration > 0) {
    const at = parseTime(o.frameAt) ?? start
    if (at !== null) pre.push('-ss', String(at))
  } else if (start !== null) pre.push('-ss', String(start))
  pre.push('-i', input)
  let args = target.args(q)
  const speed0 = o.speed && o.speed !== 1 ? o.speed : 1
  // -t limite la durée de sortie : avec un changement de vitesse, elle est divisée d'autant.
  if (target.kind !== 'image' && end !== null) args = ['-t', String(Math.max(0.1, (end - (start ?? 0)) / speed0)), ...args]
  // Une largeur choisie remplace l'échelle par défaut du GIF.
  if (o.width && target.id === 'gif') args = args.map((a) => a.replace(/,?scale=[^,]*/, '').replace(/^,/, ''))

  const vf: string[] = []
  const af: string[] = []
  if (o.width && (target.kind !== 'audio')) vf.push(`scale='min(${o.width},iw)':-2:flags=lanczos`)
  if (o.rotate === 90) vf.push('transpose=1')
  if (o.rotate === 180) vf.push('transpose=1,transpose=1')
  if (o.rotate === 270) vf.push('transpose=2')
  if (o.flip === 'h') vf.push('hflip')
  if (o.flip === 'v') vf.push('vflip')
  if (o.fps && target.kind === 'video' && target.id !== 'gif') vf.push(`fps=${o.fps}`)
  const speed = o.speed && o.speed !== 1 ? o.speed : null
  if (speed && target.kind !== 'image') {
    if (target.kind === 'video') vf.push(`setpts=PTS/${speed}`)
    af.push(...atempo(speed))
  }
  if (o.volume && o.volume !== 100) af.push(`volume=${(o.volume / 100).toFixed(2)}`)
  if (o.normalize) af.push('loudnorm=I=-16:TP=-1.5:LRA=11')

  if (target.kind !== 'audio') args = mergeFilter(args, '-vf', vf)
  if (target.kind !== 'image' && !o.mute) args = mergeFilter(args, '-af', af)
  if (o.mute && target.kind === 'video') args = [...args.filter((a, i, all) => !(a === '-af' || all[i - 1] === '-af')), '-an']

  // Taille visée : débit calculé à partir de la durée finale.
  if (o.targetMB && target.kind === 'video' && (target.id === 'mp4' || target.id === 'webm' || target.id === 'mkv' || target.id === 'mov') && info.duration > 0) {
    let dur = info.duration
    if (end !== null) dur = end - (start ?? 0)
    else if (start !== null) dur -= start
    if (speed) dur /= speed
    const audioK = o.mute ? 0 : 128
    const totalK = (o.targetMB * 8 * 1024 * 0.94) / Math.max(1, dur)
    const videoK = Math.max(80, Math.floor(totalK - audioK))
    const ci = args.indexOf('-crf')
    if (ci >= 0) args.splice(ci, 2)
    const bi = args.indexOf('-b:v')
    if (bi >= 0) args.splice(bi, 2)
    args.push('-b:v', `${videoK}k`, '-maxrate', `${Math.floor(videoK * 1.3)}k`, '-bufsize', `${videoK * 2}k`)
    const ab = args.indexOf('-b:a')
    if (ab >= 0) args[ab + 1] = '128k'
  }
  if (o.stripMeta) args.push('-map_metadata', '-1')
  return [...pre, ...args, output]
}

const queue: Job[] = []
let current: ChildProcess | null = null
let quality: 0 | 1 | 2 = 1
let outDir: string | null = null
let batchCount = 0

const push = (): void => host.send('convert:jobs', queue)

async function run(): Promise<void> {
  if (current) return
  const job = queue.find((j) => j.status === 'waiting')
  if (!job) {
    // File terminée : notification (utile quand on a lancé un gros lot et changé d'app).
    if (batchCount > 0) {
      const done = queue.filter((j) => j.status === 'done').length
      if (Notification.isSupported() && !host.window()?.isFocused()) {
        const n = new Notification({ title: 'Conversions terminées', body: `${done} fichier${done > 1 ? 's' : ''} prêt${done > 1 ? 's' : ''}.` })
        n.on('click', () => host.reveal())
        n.show()
      }
      batchCount = 0
    }
    return
  }
  const target = TARGETS.find((t) => t.id === job.target)!
  const dir = outDir ?? dirname(job.input)
  const base = basename(job.input, extname(job.input))
  const output = freeName(dir, extname(job.input).slice(1).toLowerCase() === target.ext ? `${base} (converti)` : base, target.ext)
  job.output = output
  job.status = 'running'
  push()

  const info = await probe(job.input)
  const opts = job.opts ?? {}
  let duration = info.duration
  const s = parseTime(opts.start)
  const e = parseTime(opts.end)
  if (e !== null) duration = e - (s ?? 0)
  else if (s !== null) duration -= s
  if (opts.speed && opts.speed !== 1) duration /= opts.speed

  const proc = spawn(ffmpegPath(), buildArgs(job.input, output, target, quality, opts, info), { windowsHide: true })
  current = proc
  let log = ''
  proc.stderr.on('data', (d: Buffer) => {
    const str = d.toString()
    log = (log + str).slice(-4000)
    const tm = /time=(\d+):(\d+):(\d+\.\d+)/.exec(str)
    if (tm && duration > 0) {
      job.progress = Math.min(0.99, (+tm[1] * 3600 + +tm[2] * 60 + +tm[3]) / duration)
      push()
    }
  })
  proc.on('close', (code) => {
    current = null
    const ok = code === 0 && existsSync(output) && job.status !== 'error'
    // Annulée ou ratée : pas de fichier à moitié écrit laissé dans le dossier.
    if (!ok && existsSync(output)) {
      try {
        unlinkSync(output)
      } catch {
        /* encore verrouillé : tant pis */
      }
    }
    if (ok) {
      job.status = 'done'
      job.progress = 1
      job.outSize = statSync(output).size
    } else if (job.status !== 'error') {
      job.status = 'error'
      const last = log.trim().split('\n').filter((l) => !/^\s*(frame|size|video|audio)/.test(l)).pop() ?? ''
      job.error = /Invalid data|could not find codec|does not contain any stream/i.test(log) ? 'Format non pris en charge ou fichier abîmé.' : last.slice(0, 200) || `ffmpeg a échoué (code ${code})`
    }
    push()
    void run()
  })
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('convert:jobs', () => queue)
  ipc.handle('convert:probe', (_e, path: string) => probe(path))
  ipc.handle('convert:add', (_e, files: { path: string; target: string; opts?: ConvOpts }[], q: 0 | 1 | 2, dir: string | null) => {
    quality = q
    outDir = dir
    for (const f of files) {
      queue.push({ id: `${Date.now()}-${Math.random()}`, input: f.path, output: null, target: f.target, status: 'waiting', progress: 0, inSize: statSync(f.path).size, opts: f.opts })
    }
    batchCount += files.length
    push()
    void run()
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
  ipc.handle('convert:cancelAll', () => {
    for (const j of queue) {
      if (j.status === 'waiting' || j.status === 'running') {
        j.status = 'error'
        j.error = 'Annulé'
      }
    }
    current?.kill()
    push()
    return queue
  })
  ipc.handle('convert:retry', (_e, id: string) => {
    const job = queue.find((j) => j.id === id)
    if (job && job.status === 'error') {
      job.status = 'waiting'
      job.error = undefined
      job.progress = 0
      batchCount++
      push()
      void run()
    }
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
