import { spawn } from 'child_process'
import type { CatalogEntry } from '@shared/types'
import type { PlatformInstaller } from './types'

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (err += d))
    child.on('error', (e) =>
      reject(
        (e as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(`Commande "${cmd}" introuvable sur ce système.`)
          : e
      )
    )
    child.on('exit', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `${cmd} ${args.join(' ')} a échoué (code ${code})`))
    })
  })
}

/** Trouve l'exécutable réellement installé par le paquet .deb (dpkg -L). */
async function findInstalledBinary(pkg: string): Promise<string | null> {
  const out = await run('dpkg', ['-L', pkg]).catch(() => '')
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
  const usrBin = lines.find((l) => l.startsWith('/usr/bin/'))
  if (usrBin) return usrBin
  const opt = lines.find((l) => /^\/opt\/[^/]+\/[^/]+$/.test(l))
  return opt ?? null
}

export const linuxInstaller: PlatformInstaller = {
  async detectExisting(entry) {
    try {
      await run('dpkg', ['-s', entry.debPackageName])
    } catch {
      return null
    }
    return findInstalledBinary(entry.debPackageName)
  },

  async install(entry, downloadedPath) {
    try {
      await run('pkexec', ['dpkg', '-i', downloadedPath])
    } catch (err) {
      throw new Error(
        `Installation .deb échouée (${(err as Error).message}). Tu peux l'installer toi-même : ` +
          `sudo dpkg -i "${downloadedPath}"`
      )
    }
    const bin = await findInstalledBinary(entry.debPackageName)
    if (!bin) {
      throw new Error(
        "Paquet installé mais l'exécutable n'a pas pu être localisé automatiquement."
      )
    }
    return bin
  },

  async launch(_entry, execPath) {
    spawn(execPath, [], { detached: true, stdio: 'ignore' }).unref()
  },

  async uninstall(entry) {
    await run('pkexec', ['dpkg', '-r', entry.debPackageName])
  },

  async getInstalledSize(entry) {
    // dpkg connaît déjà la taille installée du paquet (en Ko) sans avoir à
    // reparcourir nous-mêmes tous ses fichiers sur le disque.
    try {
      const out = await run('dpkg-query', ['-W', "-f=${Installed-Size}", entry.debPackageName])
      const kb = Number(out.trim())
      return Number.isFinite(kb) ? kb * 1024 : null
    } catch {
      return null
    }
  }
}
