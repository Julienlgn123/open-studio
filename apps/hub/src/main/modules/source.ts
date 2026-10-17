import { app } from 'electron'
import { copyFileSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { is } from '@electron-toolkit/utils'
import type { CatalogModule } from '@module-api/types'
import { downloadTo, fetchLatestRelease, getJson } from '../github'

// D'où viennent les modules : la dernière release GitHub d'Open Studio, ou un dossier local
// (`dist-modules`, produit par `npm run build:modules`) pour tester avant de publier.

export const INDEX_FILE = 'modules-index.json'
const OWNER = 'Julienlgn123'
const REPO = 'open-studio'

export interface ModuleSource {
  label: string
  list(): Promise<CatalogModule[]>
  /** Copie ou télécharge le zip du module vers `dest`. */
  fetch(mod: CatalogModule, dest: string, onProgress: (ratio: number) => void): Promise<void>
}

function localDir(): string | null {
  const baked = import.meta.env.MAIN_VITE_MODULES_DIR
  if (baked) return baked
  if (is.dev) return resolve(app.getAppPath(), '../../dist-modules')
  return null
}

function localSource(dir: string): ModuleSource {
  return {
    label: dir,
    async list() {
      const file = join(dir, INDEX_FILE)
      if (!existsSync(file)) throw new Error(`Aucun module construit dans ${dir} (lance « npm run build:modules »).`)
      return (JSON.parse(readFileSync(file, 'utf-8')) as { modules: CatalogModule[] }).modules
    },
    async fetch(mod, dest, onProgress) {
      copyFileSync(join(dir, mod.file), dest)
      onProgress(1)
    }
  }
}

const githubSource: ModuleSource = {
  label: 'GitHub',
  async list() {
    const rel = await fetchLatestRelease(OWNER, REPO)
    const asset = rel.assets.find((a) => a.name === INDEX_FILE)
    if (!asset) return []
    return (await getJson<{ modules: CatalogModule[] }>(asset.browser_download_url, 'application/octet-stream')).modules
  },
  async fetch(mod, dest, onProgress) {
    const rel = await fetchLatestRelease(OWNER, REPO)
    const asset = rel.assets.find((a) => a.name === mod.file)
    if (!asset) throw new Error(`${mod.file} est introuvable dans la dernière version publiée.`)
    await downloadTo(asset.browser_download_url, dest, onProgress)
  }
}

export function moduleSource(): ModuleSource {
  const dir = localDir()
  return dir ? localSource(dir) : githubSource
}
