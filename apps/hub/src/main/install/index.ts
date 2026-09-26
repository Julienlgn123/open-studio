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
import type { AppState, CatalogEntry, InstallProgress } from '@shared/types'

/** Repo de repli pour toute app du catalogue sans `owner`/`repo` propre (vit dans ce monorepo, sous `apps/<id>`). */
const SUITE_OWNER = 'Julienlgn123'
const SUITE_REPO = 'open-studio'

function repoFor(entry: CatalogEntry): { owner: string; repo: string } {
  return { owner: entry.owner ?? SUITE_OWNER, repo: entry.repo ?? SUITE_REPO }
}

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
      const { owner, repo } = repoFor(entry)
      let latestVersion: string | null = null
      let latestChangelog: string | null = null
      try {
        const rel = await fetchLatestRelease(owner, repo)
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

      // App du monorepo (pas de repo propre) : son code/icône vivent sous apps/<id> du repo suite.
      const iconPath = entry.owner ? 'resources/icon.png' : `apps/${entry.id}/resources/icon.png`
      return {
        ...entry,
        status,
        installedVersion,
        latestVersion,
        latestChangelog,
        repoUrl: entry.owner ? `https://github.com/${owner}/${repo}` : `https://github.com/${owner}/${repo}/tree/main/apps/${entry.id}`,
        logoUrl: `https://raw.githubusercontent.com/${owner}/${repo}/main/${iconPath}`
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

  const { owner, repo } = repoFor(entry)
  const rel = await fetchLatestRelease(owner, repo)
  const version = rel.tag_name.replace(/^v/, '')
  const asset = pickAsset(rel.assets, process.platform, process.arch, entry.assetPrefix)
  if (!asset) {
    throw new Error(
      `Aucun installateur disponible pour ta plateforme dans la dernière release de ${entry.name}.`
    )
  }

  const dir = managedDir(id)
  const execTargetDir = join(dir, 'install')

  // Mettre à jour par-dessus l'existant a déjà causé des installs bancales
  // (fichiers d'une ancienne version qui traînent à côté des nouveaux,
  // verrous restants...) — on désinstalle proprement d'abord, comme pour un
  // vrai premier install ensuite. `uninstall()` fait déjà le ménage du
  // dossier cible lui-même (avec retries) : pas la peine — et dangereux, ça
  // a fait planter un update sur un verrou encore temporairement présent —
  // de le refaire ici avec un rmSync brut sans retry juste après.
  const existingExecPath = await resolveExecPath(id)
  if (existingExecPath) {
    emitProgress(id, 'uninstalling', 0)
    await platformInstaller.uninstall(entry, existingExecPath)
    clearTrackedApp(id)
  }

  mkdirSync(dir, { recursive: true })
  const downloadPath = join(dir, asset.name)

  emitProgress(id, 'downloading', 0)
  await downloadTo(asset.browser_download_url, downloadPath, (ratio) =>
    emitProgress(id, 'downloading', ratio)
  )

  emitProgress(id, 'installing', 0)
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
