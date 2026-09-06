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
}

function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      { headers: { 'User-Agent': 'open-studio', Accept: 'application/vnd.github+json' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GitHub API ${res.statusCode} pour ${url}`))
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
    ).on('error', reject)
  })
}

export function fetchLatestRelease(owner: string, repo: string): Promise<GhRelease> {
  return getJson<GhRelease>(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
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
    https
      .get(url, { headers: { 'User-Agent': 'open-studio' } }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Téléchargement échoué (HTTP ${res.statusCode})`))
          res.resume()
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let done = 0
        const file = createWriteStream(destPath)
        res.on('data', (chunk: Buffer) => {
          done += chunk.length
          if (total > 0) onProgress?.(done / total)
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      })
      .on('error', reject)
  })
}
