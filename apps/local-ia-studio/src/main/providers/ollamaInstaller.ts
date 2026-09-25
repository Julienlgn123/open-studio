import { app } from 'electron'
import { createWriteStream, chmodSync, unlinkSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { InstallProgress } from '@shared/types'
import { checkOllama } from './ollama'

function installerUrlForPlatform(): { url: string; fileName: string } {
  switch (process.platform) {
    case 'win32':
      return { url: 'https://ollama.com/download/OllamaSetup.exe', fileName: 'OllamaSetup.exe' }
    case 'darwin':
      return { url: 'https://ollama.com/download/Ollama-darwin.zip', fileName: 'Ollama-darwin.zip' }
    default:
      return { url: 'https://ollama.com/install.sh', fileName: 'ollama-install.sh' }
  }
}

async function downloadFile(url: string, destPath: string, onProgress: (percent: number | null) => void): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Téléchargement échoué (HTTP ${res.status})`)

  const total = Number(res.headers.get('content-length') ?? 0) || null
  let received = 0

  const nodeStream = Readable.fromWeb(res.body as never)
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress(total ? Math.min(100, Math.round((received / total) * 100)) : null)
  })

  await pipeline(nodeStream, createWriteStream(destPath))
}

async function waitForOllama(timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await checkOllama()
    if (status.available) return true
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

export async function installOllama(onProgress: (p: InstallProgress) => void, signal?: AbortSignal): Promise<void> {
  const { url, fileName } = installerUrlForPlatform()
  const destPath = join(app.getPath('temp'), fileName)

  onProgress({ phase: 'downloading', percent: 0, message: 'Téléchargement de l’installeur Ollama…' })
  try {
    await downloadFile(url, destPath, (percent) => {
      onProgress({ phase: 'downloading', percent, message: 'Téléchargement de l’installeur Ollama…' })
    })
  } catch (err) {
    onProgress({
      phase: 'error',
      percent: null,
      message: err instanceof Error ? err.message : 'Échec du téléchargement.'
    })
    return
  }
  if (signal?.aborted) return

  onProgress({ phase: 'installing', percent: null, message: 'Installation en cours…' })

  try {
    if (process.platform === 'win32') {
      // Ollama's Windows installer is built with Inno Setup, which supports silent installs.
      await runProcess(destPath, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'])
    } else if (process.platform === 'darwin') {
      // No unattended installer on macOS: reveal the downloaded archive so the OS
      // unzips it and the user drags Ollama.app into Applications (a couple of clicks,
      // but no manual browsing/downloading was required).
      const { shell } = await import('electron')
      await shell.openPath(destPath)
      onProgress({
        phase: 'waiting',
        percent: null,
        message: 'Finalise l’installation : glisse Ollama.app dans le dossier Applications, puis lance-le une fois.'
      })
    } else {
      chmodSync(destPath, 0o755)
      await runProcess('sh', [destPath])
    }
  } catch (err) {
    onProgress({
      phase: 'error',
      percent: null,
      message:
        err instanceof Error
          ? `${err.message} — tu peux aussi lancer l’installeur téléchargé manuellement (${destPath}).`
          : 'Échec de l’installation.'
    })
    return
  }

  if (process.platform !== 'darwin') {
    onProgress({ phase: 'waiting', percent: null, message: 'Démarrage d’Ollama…' })
    const ready = await waitForOllama(90_000)
    if (!ready) {
      onProgress({
        phase: 'error',
        percent: null,
        message: 'Ollama a été installé mais ne répond pas encore. Relance l’application si besoin.'
      })
      return
    }
  }

  try {
    unlinkSync(destPath)
  } catch {
    /* best effort cleanup */
  }

  onProgress({ phase: 'done', percent: 100, message: 'Ollama est prêt.' })
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: false })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`Le programme d’installation s’est arrêté avec le code ${code}.`))
    })
  })
}
