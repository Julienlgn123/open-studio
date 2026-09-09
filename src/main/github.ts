import { https } from 'follow-redirects'
import { createWriteStream } from 'fs'

export interface GhAsset {
  name: string
  browser_download_url: string
  size: number
}

export interface GhRelease {
  tag_name: string
  assets: GhAsset[]
  body?: string
}

/** Délai au-delà duquel une connexion sans aucune donnée est considérée bloquée. */
const IDLE_TIMEOUT_MS = 20_000

function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https
      .get(
        url,
        {
          headers: { 'User-Agent': 'open-studio', Accept: 'application/vnd.github+json' },
          timeout: IDLE_TIMEOUT_MS
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            // 403 sans authentification = très souvent la limite de l'API
            // GitHub (60 requêtes/heure par IP, parfois partagée par tout un
            // réseau) plutôt qu'une vraie erreur — message dédié pour que la
            // personne comprenne que ce n'est pas cassé, juste à retenter
            // plus tard.
            const msg =
              res.statusCode === 403
                ? "Limite de requêtes GitHub atteinte (trop de vérifications en peu de temps sur ce réseau) — réessaie dans quelques minutes."
                : `GitHub API ${res.statusCode} pour ${url}`
            reject(new Error(msg))
            res.resume()
            return
          }
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as T)
            } catch (err) {
              reject(err)
            }
          })
        }
      )
      .on('error', reject)
    // `timeout` ci-dessus coupe si la connexion ne s'établit jamais ; celui-ci
    // couvre le cas où elle s'établit mais reste ensuite muette (pas de
    // 'error' ni de 'end') — sans ça, une requête GitHub qui traîne bloque
    // silencieusement toute la vérification de mise à jour.
    req.on('timeout', () => req.destroy(new Error('Délai dépassé en contactant GitHub.')))
  })
}

/**
 * Cache mémoire des releases (clé = "owner/repo"). Sans ça, chaque
 * rafraîchissement du catalogue (au démarrage, et après chaque install /
 * update / uninstall) refait un appel par app à l'API GitHub non
 * authentifiée — plafonnée à 60 requêtes/heure par IP, vite atteinte rien
 * qu'en testant l'app plusieurs fois de suite (403 sinon). Une entrée
 * fraîche évite l'appel réseau ; une entrée périmée est réutilisée en
 * dépannage si GitHub répond en erreur, plutôt que de faire échouer toute
 * l'action en cours pour une info qui a peu de chances d'avoir changé.
 */
const RELEASE_CACHE_TTL_MS = 5 * 60_000
const releaseCache = new Map<string, { data: GhRelease; fetchedAt: number }>()

export async function fetchLatestRelease(owner: string, repo: string): Promise<GhRelease> {
  const key = `${owner}/${repo}`
  const cached = releaseCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < RELEASE_CACHE_TTL_MS) {
    return cached.data
  }
  try {
    const data = await getJson<GhRelease>(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
    releaseCache.set(key, { data, fetchedAt: Date.now() })
    return data
  } catch (err) {
    if (cached) return cached.data
    throw err
  }
}

/** Choisit l'asset adapté à l'OS/arch courants dans les assets d'une release. */
export function pickAsset(assets: GhAsset[], platform: NodeJS.Platform, arch: string): GhAsset | null {
  const byPattern = (re: RegExp): GhAsset | undefined => assets.find((a) => re.test(a.name))

  if (platform === 'win32') {
    return byPattern(/setup.*\.exe$/i) ?? byPattern(/\.exe$/i) ?? null
  }
  if (platform === 'darwin') {
    const wantArm = arch === 'arm64'
    return (
      (wantArm ? byPattern(/arm64.*\.dmg$/i) : byPattern(/x64.*\.dmg$/i)) ??
      byPattern(/\.dmg$/i) ??
      null
    )
  }
  // linux
  return byPattern(/\.deb$/i) ?? null
}

/** Télécharge une URL vers un fichier local, avec callback de progression (0..1). */
export function downloadTo(
  url: string,
  destPath: string,
  onProgress?: (ratio: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(idleTimer)
      fn()
    }

    // Timeout glissant plutôt que fixe : un gros installateur sur une
    // connexion lente doit pouvoir prendre plusieurs minutes tant que des
    // octets arrivent toujours ; seule une connexion qui s'arrête net (plus
    // aucune donnée) déclenche l'abandon, au lieu de laisser la barre de
    // progression tourner indéfiniment sans jamais échouer.
    let idleTimer: NodeJS.Timeout
    const resetIdleTimer = (): void => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        req.destroy()
        finish(() => reject(new Error('Téléchargement interrompu (connexion inactive trop longtemps).')))
      }, IDLE_TIMEOUT_MS)
    }

    const req = https
      .get(url, { headers: { 'User-Agent': 'open-studio' } }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          finish(() => reject(new Error(`Téléchargement échoué (HTTP ${res.statusCode})`)))
          res.resume()
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let done = 0
        const file = createWriteStream(destPath)
        resetIdleTimer()
        res.on('data', (chunk: Buffer) => {
          done += chunk.length
          resetIdleTimer()
          if (total > 0) onProgress?.(done / total)
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => finish(resolve)))
        file.on('error', (err) => finish(() => reject(err)))
      })
      .on('error', (err) => finish(() => reject(err)))
    resetIdleTimer()
  })
}
