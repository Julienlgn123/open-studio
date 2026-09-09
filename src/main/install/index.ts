import { app } from 'electron'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { CATALOG } from '../catalog'
import { fetchLatestRelease, pickAsset, downloadTo } from '../github'
import { getTrackedApp, setTrackedApp, clearTrackedApp } from '../store'
import { broadcast } from '../events'
import { winInstaller } from './win'
import { macInstaller } from './mac'
import { linuxInstaller } from './linux'
import type { AppState, InstallProgress } from '@shared/types'

const platformInstaller =
  process.platform === 'win32' ? winInstaller : process.platform === 'darwin' ? macInstaller : linuxInstaller

function managedDir(id: string): string {
  return join(app.getPath('userData'), 'apps', id)
}

/** Résout le chemin exécutable connu pour une app : suivi Open Studio, sinon détection d'un install déjà présent. */
async function resolveExecPath(id: string): Promise<string | null> {
  const tracked = getTrackedApp(id)
  if (tracked && existsSync(tracked.installPath)) return tracked.installPath
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) return null
  return platformInstaller.detectExisting(entry)
}

export async function listAppStates(): Promise<AppState[]> {
  return Promise.all(
    CATALOG.map(async (entry) => {
      const execPath = await resolveExecPath(entry.id).catch(() => null)
      const tracked = getTrackedApp(entry.id)
      let latestVersion: string | null = null
      let latestChangelog: string | null = null
      try {
        const rel = await fetchLatestRelease(entry.owner, entry.repo)
        latestVersion = rel.tag_name.replace(/^v/, '')
        latestChangelog = rel.body ?? null
      } catch {
        // Pas de connexion / repo indisponible : on garde le statut connu.
      }
      const installedVersion = tracked?.installedVersion ?? (execPath ? 'inconnue' : null)
      const status: AppState['status'] = !execPath
        ? 'not_installed'
        : latestVersion && installedVersion && latestVersion !== installedVersion
          ? 'update_available'
          : 'installed'

      return {
        ...entry,
        status,
        installedVersion,
        latestVersion,
        latestChangelog,
        repoUrl: `https://github.com/${entry.owner}/${entry.repo}`,
        logoUrl: `https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/main/resources/icon.png`
      }
    })
  )
}

function emitProgress(id: string, phase: InstallProgress['phase'], pct: number): void {
  broadcast('apps:progress', { id, phase, pct } as InstallProgress)
}

export async function installOrUpdateApp(id: string): Promise<AppState> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error('App inconnue : ' + id)

  const rel = await fetchLatestRelease(entry.owner, entry.repo)
  const version = rel.tag_name.replace(/^v/, '')
  const asset = pickAsset(rel.assets, process.platform, process.arch)
  if (!asset) {
    throw new Error(
      `Aucun installateur disponible pour ta plateforme dans la dernière release de ${entry.name}.`
    )
  }

  const dir = managedDir(id)
  mkdirSync(dir, { recursive: true })
  const downloadPath = join(dir, asset.name)

  emitProgress(id, 'downloading', 0)
  await downloadTo(asset.browser_download_url, downloadPath, (ratio) =>
    emitProgress(id, 'downloading', ratio)
  )

  emitProgress(id, 'installing', 0)
  const execTargetDir = join(dir, 'install')
  mkdirSync(execTargetDir, { recursive: true })
  const execPath = await platformInstaller.install(entry, downloadPath, execTargetDir)
  emitProgress(id, 'installing', 1)

  rmSync(downloadPath, { force: true })
  setTrackedApp(id, { installPath: execPath, installedVersion: version })

  const [state] = await listAppStates().then((all) => all.filter((a) => a.id === id))
  return state
}

export async function launchApp(id: string): Promise<void> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error('App inconnue : ' + id)
  const execPath = await resolveExecPath(id)
  if (!execPath) throw new Error(`${entry.name} n'est pas installé.`)
  await platformInstaller.launch(entry, execPath)
}

export async function uninstallApp(id: string): Promise<void> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error('App inconnue : ' + id)
  const execPath = await resolveExecPath(id)
  if (execPath) await platformInstaller.uninstall(entry, execPath)
  clearTrackedApp(id)
  rmSync(managedDir(id), { recursive: true, force: true })
}

/**
 * Calculée à la demande seulement (pas dans listAppStates) : un parcours disque
 * (ou un appel dpkg) par app à chaque rafraîchissement du catalogue serait du
 * travail inutile pour une info que personne ne regarde tant qu'elle n'est
 * pas affichée.
 */
export async function getInstalledSize(id: string): Promise<number | null> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) return null
  const execPath = await resolveExecPath(id)
  if (!execPath) return null
  return platformInstaller.getInstalledSize(entry, execPath).catch(() => null)
}
