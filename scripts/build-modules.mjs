// Construit chaque module (apps/* avec un champ "openStudioModule" dans son package.json) et
// l'emballe en zip installable par Open Studio, avec le catalogue modules-index.json.
//
//   node scripts/build-modules.mjs            → construit puis emballe tout, dans dist-modules/
//   node scripts/build-modules.mjs --no-build → emballe seulement (out/ déjà construit)
//   node scripts/build-modules.mjs cours-studio → un seul module
//
// Open Studio en développement (et la version de test) lit directement dist-modules/ ;
// à la publication, ces fichiers deviennent des assets de la release GitHub.
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'dist-modules')
const args = process.argv.slice(2)
const build = !args.includes('--no-build')
const only = args.filter((a) => !a.startsWith('--'))

const modules = readdirSync(join(root, 'apps'))
  .map((dir) => ({ dir: join(root, 'apps', dir), pkg: JSON.parse(readFileSync(join(root, 'apps', dir, 'package.json'), 'utf-8')) }))
  .filter((m) => m.pkg.openStudioModule && (!only.length || only.includes(m.pkg.openStudioModule.id)))

if (!only.length) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const indexPath = join(out, 'modules-index.json')
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : { modules: [] }

for (const { dir, pkg } of modules) {
  const manifest = { ...pkg.openStudioModule, version: pkg.version }
  console.log(`\n▸ ${manifest.name} ${manifest.version}`)
  if (build) execSync('npx electron-vite build', { cwd: dir, stdio: 'inherit' })

  const zip = new AdmZip()
  for (const part of ['main', 'preload', 'renderer']) {
    const src = join(dir, 'out', part)
    if (!existsSync(src)) throw new Error(`${manifest.id} : ${src} manquant (build d'abord)`)
    zip.addLocalFolder(src, part)
  }
  const icon = join(dir, 'resources', 'icon.png')
  zip.addLocalFile(icon)
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)))

  const file = `${manifest.id}-${manifest.version}.zip`
  const target = join(out, file)
  zip.writeZip(target)
  const buf = readFileSync(target)
  const entry = {
    ...manifest,
    file,
    size: statSync(target).size,
    sha256: createHash('sha256').update(buf).digest('hex'),
    icon: `data:image/png;base64,${readFileSync(icon).toString('base64')}`
  }
  index.modules = [...index.modules.filter((m) => m.id !== manifest.id), entry]
  console.log(`  ${file} — ${(entry.size / 1024 / 1024).toFixed(1)} Mo`)
}

index.modules.sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(indexPath, JSON.stringify(index, null, 2))
console.log(`\n✓ ${index.modules.length} module(s) dans ${out}`)
