import type { CatalogEntry } from '@shared/types'

export interface PlatformInstaller {
  /** Cherche une install déjà présente à l'emplacement conventionnel (hors suivi Open Studio). */
  detectExisting(entry: CatalogEntry): Promise<string | null>
  /** Installe depuis le fichier téléchargé, renvoie le chemin de l'exécutable/app installé. */
  install(entry: CatalogEntry, downloadedPath: string, managedDir: string): Promise<string>
  launch(entry: CatalogEntry, execPath: string): Promise<void>
  uninstall(entry: CatalogEntry, execPath: string): Promise<void>
}
