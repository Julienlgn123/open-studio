import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { CatalogEntry } from '@shared/types'
import type { PlatformInstaller } from './types'

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let out = ''
    child.stdout?.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} ${args.join(' ')} a échoué (code ${code})`))
    })
  })
}

function appPathFor(entry: CatalogEntry): string {
  return `/Applications/${entry.productName}.app`
}

export const macInstaller: PlatformInstaller = {
  async detectExisting(entry) {
    const p = appPathFor(entry)
    return existsSync(p) ? p : null
  },

  async install(entry, downloadedPath) {
    const mountPoint = mkdtempSync(join(tmpdir(), 'open-studio-mount-'))
    try {
      await run('hdiutil', ['attach', downloadedPath, '-nobrowse', '-mountpoint', mountPoint])
      const appName = readdirSync(mountPoint).find((f) => f.endsWith('.app'))
      if (!appName) throw new Error("Le .dmg téléchargé ne contient pas d'app (.app) reconnaissable.")

      const dest = appPathFor(entry)
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
      await run('cp', ['-R', join(mountPoint, appName), '/Applications/'])
      // Lève le quarantine flag : sans certificat Developer ID, macOS bloquerait
      // sinon le lancement en le signalant comme "endommagé".
      await run('xattr', ['-cr', dest]).catch(() => null)
      return dest
    } finally {
      await run('hdiutil', ['detach', mountPoint]).catch(() => null)
      rmSync(mountPoint, { recursive: true, force: true })
    }
  },

  async launch(_entry, execPath) {
    spawn('open', ['-a', execPath], { detached: true, stdio: 'ignore' }).unref()
  },

  async uninstall(_entry, execPath) {
    rmSync(execPath, { recursive: true, force: true })
  }
}
