/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Nom de profil (dossier de données séparé) pour une version de test. */
  readonly MAIN_VITE_PROFILE?: string
  /** Dossier local des modules construits, à la place de GitHub (version de test). */
  readonly MAIN_VITE_MODULES_DIR?: string
}
