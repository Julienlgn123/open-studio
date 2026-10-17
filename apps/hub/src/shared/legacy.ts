/** Ancienne app autonome de la suite, telle que la cherchent les installateurs par plateforme. */
export interface CatalogEntry {
  id: string
  name: string
  /** `build.productName` de l'ancienne app (nom du .exe / du .app). */
  productName: string
  /** Nom du paquet .deb (Linux). */
  debPackageName: string
}
