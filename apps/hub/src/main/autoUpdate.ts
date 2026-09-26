import { rmSync } from 'fs'
import { broadcast } from './events'
import { downloadSuiteZip, installOrUpdateApp, isAppRunning, isInstalling, listAppStates } from './install'
import { getTrackedApp } from './store'

/** Fréquence des vérifications de mise à jour (Open Studio et apps gérées). */
export const UPDATE_INTERVAL_MS = 30 * 60_000
const FIRST_CHECK_DELAY_MS = 45_000

let cycleRunning = false

/**
 * Met à jour les apps gérées qui ont une nouvelle version, sauf celles ouvertes (réessayées au
 * prochain passage). Seules les apps installées par Open Studio sont concernées : une install
 * détectée ailleurs (version « inconnue ») n'est jamais remplacée sans que la personne le demande.
 */
async function runCycle(): Promise<void> {
  if (cycleRunning || isInstalling()) return
  cycleRunning = true
  let sharedZip: string | null = null
  try {
    const states = await listAppStates()
    const due = states.filter((s) => s.status === 'update_available' && getTrackedApp(s.id))
    const ready = []
    for (const s of due) {
      if (getTrackedApp(s.id) && !(await isAppRunning(s.id))) ready.push(s)
    }
    if (!ready.length) return

    // Les apps de la suite sont toutes dans le même zip par OS : un seul téléchargement pour toutes.
    if (ready.filter((s) => !s.owner).length > 1) sharedZip = await downloadSuiteZip()

    for (const s of ready) {
      try {
        const updated = await installOrUpdateApp(s.id, { sharedZipPath: s.owner ? undefined : (sharedZip ?? undefined) })
        broadcast('apps:autoUpdated', { id: s.id, name: s.name, version: updated.installedVersion })
      } catch (err) {
        broadcast('apps:autoUpdated', { id: s.id, name: s.name, version: null, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } catch (err) {
    // Pas de réseau, GitHub indisponible… : on réessaiera au prochain passage.
    console.error('[autoUpdate apps]', err)
  } finally {
    if (sharedZip) rmSync(sharedZip, { force: true })
    cycleRunning = false
  }
}

export function startManagedAppsAutoUpdate(): void {
  setTimeout(() => void runCycle(), FIRST_CHECK_DELAY_MS)
  setInterval(() => void runCycle(), UPDATE_INTERVAL_MS)
}
