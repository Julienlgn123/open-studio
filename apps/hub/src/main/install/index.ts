import { app } from 'electron'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { CATALOG } from '../catalog'
import { compareVersions, fetchLatestRelease, fetchReleases, fetchSuiteManifest, pickAsset, downloadTo, type GhRelease } from '../github'
import { execFile } from 'child_process'
import { basename } from 'path'
import { normalizeVersion, readInstalledVersion } from './version'
import { getTrackedApp, setTrackedApp, clearTrackedApp, getSkippedUpdate, setSkippedUpdate } from '../store'
import { broadcast } from '../events'
import { winInstaller } from './win'
import { macInstaller } from './mac'
import { linuxInstaller } from './linux'
import { osZipAssetName, extractInstaller } from './zipSource'
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
      // Numéro de la suite (pas de manifeste) : seul le numéro noté à l'install est comparable.
      let suiteNumbering = false
      try {
        const rel = await fetchLatestRelease(owner, repo)
        latestVersion = rel.tag_name.replace(/^v/, '')
        latestChangelog = rel.body ?? null
        if (!entry.owner) {
          // App de la suite : la release (v1.7.0) regroupe toutes les apps, c'est le manifeste
          // qui donne la vraie version de celle-ci et ce qui a changé pour elle.
          const manifest = await fetchSuiteManifest(rel).catch(() => null)
          const own = manifest?.[entry.id]
          if (own) {
            latestVersion = own.version
            latestChangelog = own.notes?.trim() || null
          } else if (manifest) {
            latestVersion = null
          } else {
            suiteNumbering = true
          }
        }
      } catch {
        // Pas de connexion / repo indisponible : on garde le statut connu.
      }
      // La version lue dans l'app installée fait foi ; celle notée à l'install sert de repli.
      const realVersion = execPath && !suiteNumbering ? await readInstalledVersion(entry, execPath).catch(() => null) : null
      const installedVersion = realVersion ?? tracked?.installedVersion ?? (execPath ? 'inconnue' : null)
      // Version mise de côté après un retour arrière : ignorée jusqu'à la suivante.
      const skipped = getSkippedUpdate(entry.id)
      const skippedVersion = skipped && latestVersion && normalizeVersion(skipped) === normalizeVersion(latestVersion) ? skipped : null
      const status: AppState['status'] = !execPath
        ? 'not_installed'
        : latestVersion && installedVersion && !skippedVersion && normalizeVersion(latestVersion) !== normalizeVersion(installedVersion)
          ? 'update_available'
          : 'installed'

      // App du monorepo (pas de repo propre) : son code/icône vivent sous apps/<id> du repo suite.
      const iconPath = entry.owner ? 'resources/icon.png' : `apps/${entry.id}/resources/icon.png`
      return {
        ...entry,
        status,
        skippedVersion,
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

// Apps en cours d'installation / mise à jour : empêche deux opérations simultanées sur la même
// app (clic manuel pendant une mise à jour automatique) et retarde le redémarrage d'Open Studio.
const busyApps = new Set<string>()

export function isInstalling(): boolean {
  return busyApps.size > 0
}

/** Télécharge le zip de la suite pour cet OS une seule fois, pour mettre à jour plusieurs apps d'un coup. */
export async function downloadSuiteZip(): Promise<string> {
  const rel = await fetchLatestRelease(SUITE_OWNER, SUITE_REPO)
  const name = osZipAssetName()
  const asset = rel.assets.find((a) => a.name === name)
  if (!asset) throw new Error(`Le zip ${name} est introuvable dans la dernière release.`)
  const dir = join(app.getPath('userData'), 'apps')
  mkdirSync(dir, { recursive: true })
  const zipPath = join(dir, `suite-${rel.tag_name}-${name}`)
  await downloadTo(asset.browser_download_url, zipPath, () => {})
  return zipPath
}

/** L'app gérée est-elle ouverte ? (on ne la remplace ni ne la nettoie jamais pendant qu'elle tourne) */
export async function isAppRunning(id: string): Promise<boolean> {
  const execPath = await resolveExecPath(id).catch(() => null)
  if (!execPath) return false
  return new Promise((resolveRunning) => {
    if (process.platform === 'win32') {
      const image = basename(execPath)
      execFile('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
        // En cas de doute (tasklist indisponible), on considère l'app ouverte : mieux vaut attendre.
        resolveRunning(err ? true : stdout.toLowerCase().includes(`"${image.toLowerCase()}"`))
      })
      return
    }
    // macOS : chemin du .app ; Linux : chemin de l'exécutable. pgrep sort en 1 si rien ne tourne.
    const pattern = process.platform === 'darwin' ? `${execPath}/Contents/MacOS/` : execPath
    execFile('pgrep', ['-f', pattern], (err) => resolveRunning(!err ? true : (err as { code?: unknown }).code !== 1))
  })
}

/** Version précédente disponible dans les releases (celle d'avant la version installée). */
export async function findPreviousVersion(id: string): Promise<{ version: string; release: GhRelease } | null> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) return null
  const [state] = (await listAppStates()).filter((a) => a.id === id)
  const current = state?.installedVersion
  if (!current || current === 'inconnue') return null
  const { owner, repo } = repoFor(entry)
  for (const rel of await fetchReleases(owner, repo)) {
    let version: string | null
    if (entry.owner) version = rel.tag_name.replace(/^v/, '')
    else version = (await fetchSuiteManifest(rel).catch(() => null))?.[entry.id]?.version ?? null
    if (version && compareVersions(version, current) < 0) return { version, release: rel }
  }
  return null
}

/**
 * Revient à la version précédente d'une app (mise à jour qui pose problème). La version
 * quittée est mise de côté : ni proposée ni installée automatiquement, jusqu'à la suivante.
 */
export async function rollbackApp(id: string): Promise<AppState> {
  const prev = await findPreviousVersion(id)
  if (!prev) throw new Error('Aucune version précédente disponible pour cette app.')
  if (await isAppRunning(id)) throw new Error('Ferme l’app avant de revenir à la version précédente.')
  const [before] = (await listAppStates()).filter((a) => a.id === id)
  const state = await installOrUpdateApp(id, { release: prev.release, version: prev.version })
  const skip = before?.latestVersion ?? before?.installedVersion
  if (skip) setSkippedUpdate(id, skip)
  const [after] = (await listAppStates()).filter((a) => a.id === id)
  return after ?? state
}

/** Réactive une mise à jour mise de côté après un retour arrière. */
export function unskipUpdate(id: string): void {
  setSkippedUpdate(id, null)
}

export async function installOrUpdateApp(
  id: string,
  opts: { sharedZipPath?: string; release?: GhRelease; version?: string } = {}
): Promise<AppState> {
  if (busyApps.has(id)) throw new Error('Une installation de cette app est déjà en cours.')
  busyApps.add(id)
  try {
    return await doInstallOrUpdate(id, opts)
  } finally {
    busyApps.delete(id)
    // Toujours signaler la fin : sinon la carte reste sur « Installation… » quand la mise
    // à jour a été lancée ailleurs que depuis elle (panneau des mises à jour, automatique).
    emitProgress(id, 'done', 1)
  }
}

async function doInstallOrUpdate(id: string, opts: { sharedZipPath?: string; release?: GhRelease; version?: string }): Promise<AppState> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error('App inconnue : ' + id)

  const { owner, repo } = repoFor(entry)
  // Une release précise (retour arrière), sinon la dernière.
  const rel = opts.release ?? (await fetchLatestRelease(owner, repo))
  const manifest = entry.owner ? null : await fetchSuiteManifest(rel).catch(() => null)
  const version = opts.version ?? manifest?.[entry.id]?.version ?? rel.tag_name.replace(/^v/, '')
  // Mise à jour normale vers la dernière version : plus rien n'est mis de côté.
  if (!opts.release) setSkippedUpdate(id, null)

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
  let downloadPath: string

  if (entry.owner) {
    // App encore sur son propre repo : son installateur est un asset direct.
    const asset = pickAsset(rel.assets, process.platform, process.arch, entry.assetPrefix)
    if (!asset) {
      throw new Error(
        `Aucun installateur disponible pour ta plateforme dans la dernière release de ${entry.name}.`
      )
    }
    downloadPath = join(dir, asset.name)
    emitProgress(id, 'downloading', 0)
    await downloadTo(asset.browser_download_url, downloadPath, (ratio) =>
      emitProgress(id, 'downloading', ratio)
    )
  } else {
    // App de ce monorepo : pas d'asset séparé sur la release (ça ferait
    // autant de fichiers que d'apps) — son installateur est extrait du zip
    // par OS, qui contient déjà tout. Coûte un téléchargement plus gros
    // (tout l'OS au lieu du seul fichier voulu), en échange d'une page de
    // release qui ne liste plus un installateur par app gérée.
    let zipPath = opts.sharedZipPath
    if (!zipPath) {
      const zipAssetName = osZipAssetName()
      const zipAsset = rel.assets.find((a) => a.name === zipAssetName)
      if (!zipAsset) {
        throw new Error(`Le zip ${zipAssetName} est introuvable dans la dernière release.`)
      }
      zipPath = join(dir, zipAssetName)
      emitProgress(id, 'downloading', 0)
      await downloadTo(zipAsset.browser_download_url, zipPath, (ratio) =>
        emitProgress(id, 'downloading', ratio)
      )
    }
    downloadPath = join(dir, `${entry.assetPrefix ?? entry.id}-installer${process.platform === 'win32' ? '.exe' : process.platform === 'darwin' ? '.dmg' : '.deb'}`)
    extractInstaller(zipPath, entry.assetPrefix ?? '', downloadPath)
    // Un zip partagé (mise à jour groupée) est supprimé par l'appelant, une fois toutes les apps faites.
    if (!opts.sharedZipPath) rmSync(zipPath, { force: true })
  }

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
