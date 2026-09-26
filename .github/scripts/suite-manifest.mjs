// Écrit suite-versions.json : la vraie version de chaque app de la suite et ses nouveautés
// depuis la release précédente. Open Studio s'en sert pour ne proposer une mise à jour
// que si l'app a réellement changé (le numéro de la release, lui, concerne toute la suite).
// Usage : node .github/scripts/suite-manifest.mjs <tag> <fichier de sortie>
import { execFileSync } from 'child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const [tag, out] = process.argv.slice(2)
if (!tag || !out) throw new Error('usage: suite-manifest.mjs <tag> <out>')

const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim()

let previous = ''
try {
  previous = git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`)
} catch {
  // Première release : pas de tag précédent.
}

const manifest = {}
for (const id of readdirSync('apps')) {
  const pkgPath = join('apps', id, 'package.json')
  if (id === 'hub' || !existsSync(pkgPath)) continue
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const range = previous ? `${previous}..${tag}` : tag
  const subjects = git('log', '--no-merges', '--pretty=format:%s', range, '--', `apps/${id}`)
    .split('\n')
    .filter(Boolean)
    .slice(0, 30)
  manifest[id] = { version, notes: subjects.map((s) => `- ${s}`).join('\n') }
}

writeFileSync(out, JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
