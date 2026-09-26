import AdmZip from 'adm-zip'
import { writeFileSync } from 'fs'
import { pickInstallerName } from '../github'

/**
 * Les apps du monorepo (sans `owner`/`repo` propre) n'ont plus leur propre
 * installateur en asset séparé sur la release — ils ne vivent que dans le zip
 * par OS, pour ne pas encombrer la page de release d'autant de fichiers que
 * d'apps. `assetPrefix` reste indispensable ici pour distinguer les apps
 * entre elles à l'intérieur du même zip.
 */
export function osZipAssetName(): string {
  if (process.platform === 'win32') return 'Open-Studio-Windows.zip'
  if (process.platform === 'darwin') return 'Open-Studio-macOS.zip'
  return 'Open-Studio-Linux.zip'
}

/** Extrait l'installateur d'une app depuis un zip par-OS déjà téléchargé, et l'écrit à `destPath`. */
export function extractInstaller(zipPath: string, assetPrefix: string, destPath: string): void {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  const name = pickInstallerName(
    entries.map((e) => e.entryName),
    process.platform,
    process.arch,
    assetPrefix
  )
  const entry = name ? entries.find((e) => e.entryName === name) : undefined
  if (!entry) {
    throw new Error(`Aucun installateur pour cette app dans ${osZipAssetName()}.`)
  }
  writeFileSync(destPath, entry.getData())
}
