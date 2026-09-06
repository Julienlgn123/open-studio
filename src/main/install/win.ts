import { spawn } from 'child_process'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import type { CatalogEntry } from '@shared/types'
import type { PlatformInstaller } from './types'

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} a échoué (code ${code})`))
    })
  })
}

export const winInstaller: PlatformInstaller = {
  async detectExisting(entry) {
    // Emplacement par défaut d'un install NSIS fait manuellement par
    // l'utilisateur (Programs\<productName>\<productName>.exe).
    const p = join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      entry.productName,
      `${entry.productName}.exe`
    )
    return existsSync(p) ? p : null
  },

  async install(entry, downloadedPath, managedDir) {
    // NSIS exige que /D soit le DERNIER argument et ne soit jamais entre
    // guillemets, même si le chemin contient des espaces.
    await run(downloadedPath, ['/S', `/D=${managedDir}`])
    const exe = join(managedDir, `${entry.productName}.exe`)
    if (!existsSync(exe)) {
      throw new Error(
        "L'installateur s'est terminé mais l'exécutable est introuvable à l'emplacement attendu."
      )
    }
    return exe
  },

  async launch(_entry, execPath) {
    spawn(execPath, [], { detached: true, stdio: 'ignore' }).unref()
  },

  async uninstall(entry, execPath) {
    const dir = execPath.slice(0, execPath.lastIndexOf('\\'))
    const uninstaller = join(dir, `Uninstall ${entry.productName}.exe`)
    if (existsSync(uninstaller)) {
      await run(uninstaller, ['/S']).catch(() => null)
    }
    rmSync(dir, { recursive: true, force: true })
  }
}
