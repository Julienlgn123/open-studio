import { resolve } from 'path'
import type { Plugin } from 'vite'

// Config de build commune aux modules (electron.vite.config.ts de chaque module).
//
// Le code des anciennes apps importe « electron » : on le redirige vers les remplaçants de
// src/main.ts et src/preload.ts. Par transformation du source (et pas par alias) : electron
// est « external », Rollup l'écarterait avant même de regarder les alias.

const SRC = resolve(__dirname, 'src')
const SHIMS = { main: resolve(SRC, 'main.ts'), preload: resolve(SRC, 'preload.ts') }
const HOST = resolve(SRC, 'host.ts')

/**
 * Dépendances fournies par Open Studio (modules natifs, ou trop lourdes à embarquer dans
 * chaque zip) : laissées en `require()` et résolues dans les node_modules de l'hôte.
 */
export const HOST_PROVIDED = [
  'better-sqlite3',
  'node-llama-cpp',
  'ffmpeg-static',
  'fluent-ffmpeg',
  'googleapis',
  'pdf-parse',
  'mammoth',
  'katex',
  'jszip'
]

function redirectElectron(kind: 'main' | 'preload'): Plugin {
  const target = SHIMS[kind].replace(/\\/g, '/')
  return {
    name: `open-studio-module-${kind}`,
    enforce: 'pre',
    transform(code, id) {
      const file = id.replace(/\\/g, '/')
      if (file.includes('/node_modules/') || file.startsWith(SRC.replace(/\\/g, '/'))) return null
      if (!/['"]electron['"]/.test(code)) return null
      return code
        .replace(/from\s+(['"])electron\1/g, `from '${target}'`)
        .replace(/(require|import)\((['"])electron\2\)/g, `$1('${target}')`)
    }
  }
}

// Tableau (pas fonction) : electron-vite le concatène à ses propres externals (electron, node:*).
const external = [...HOST_PROVIDED, new RegExp(`^(${HOST_PROVIDED.join('|')})/.+`)]

export function moduleMainConfig(alias: Record<string, string> = {}) {
  return {
    plugins: [redirectElectron('main')],
    resolve: { alias: { '@open-studio/module': HOST, ...alias } },
    build: { rollupOptions: { external } }
  }
}

export function modulePreloadConfig(alias: Record<string, string> = {}) {
  return {
    plugins: [redirectElectron('preload')],
    resolve: { alias }
  }
}
