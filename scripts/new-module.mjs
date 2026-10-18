// Crée le squelette d'un module d'Open Studio dans apps/<id>/ (ne touche jamais un dossier existant).
//
//   node scripts/new-module.mjs <id> "<Nom>" "<accroche>" "<catégorie>" "<#couleur>"
//
// Le module obtenu utilise le kit commun : `window.kit` (stockage, fichiers, réseau…) et `@ui`
// (styles et composants). Il reste à écrire src/renderer/src/App.tsx et à ajouter resources/icon.png.
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const [id, name, tagline, category, accent, description] = process.argv.slice(2)
if (!id || !name) {
  console.error('Usage : node scripts/new-module.mjs <id> "<Nom>" "<accroche>" "<catégorie>" "<#couleur>" ["<description>"]')
  process.exit(1)
}
const dir = resolve(import.meta.dirname, '..', 'apps', id)
if (existsSync(dir)) {
  console.error(`${dir} existe déjà.`)
  process.exit(1)
}

const files = {
  'package.json': JSON.stringify(
    {
      name: id,
      version: '1.0.0',
      private: true,
      description: tagline,
      main: 'out/main/index.js',
      scripts: {
        build: 'electron-vite build',
        typecheck: 'tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json'
      },
      dependencies: {},
      openStudioModule: {
        id,
        name,
        tagline: tagline ?? '',
        description: description ?? tagline ?? '',
        category: category ?? 'Outils',
        accent: accent ?? '#7c6ff7',
        dataDirName: `open-studio-${id}`
      }
    },
    null,
    2
  ) + '\n',
  'electron.vite.config.ts': `import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { moduleMainConfig, modulePreloadConfig, moduleRendererConfig } from '../../packages/module-api/vite'

// Module d'Open Studio : main et preload chargés par Open Studio, interface avec le kit commun (@ui).
export default defineConfig({
  main: moduleMainConfig(),
  preload: modulePreloadConfig(),
  renderer: moduleRendererConfig({ '@renderer': resolve('src/renderer/src') })
})
`,
  'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './tsconfig.node.json' }, { path: './tsconfig.web.json' }] }, null, 2) + '\n',
  'tsconfig.node.json': JSON.stringify(
    {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ES2022',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        baseUrl: '.',
        types: ['node'],
        paths: {
          '@open-studio/module': ['../../packages/module-api/src/host.ts'],
          '@open-studio/kit': ['../../packages/module-api/src/kit-main.ts']
        }
      },
      include: ['src/main/**/*', '../../packages/module-api/src/host.ts', '../../packages/module-api/src/types.ts', '../../packages/module-api/src/kit-main.ts']
    },
    null,
    2
  ) + '\n',
  'tsconfig.web.json': JSON.stringify(
    {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ES2022',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: ['node'],
        baseUrl: '.',
        paths: {
          '@renderer/*': ['src/renderer/src/*'],
          '@ui': ['../../packages/module-ui/index.tsx'],
          '@open-studio/kit': ['../../packages/module-api/src/kit-preload.ts']
        }
      },
      include: ['src/renderer/src/**/*', 'src/preload/**/*', '../../packages/module-ui/*.tsx']
    },
    null,
    2
  ) + '\n',
  'src/main/index.ts': `import { registerKit } from '@open-studio/kit'

// ${name} dans Open Studio.
export function activate(): void {
  registerKit()
}
`,
  'src/preload/index.ts': `import { exposeKit } from '@open-studio/kit'

exposeKit()
`,
  'src/renderer/index.html': `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
    <script type="module" src="/src/main.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
  'src/renderer/src/main.tsx': `import { boot } from '@ui'
import App from './App'

boot(App)
`,
  'src/renderer/src/App.tsx': `import { Layout, Page, Toasts } from '@ui'

export default function App(): JSX.Element {
  return (
    <Layout>
      <Page title="${name}">${tagline ?? ''}</Page>
      <Toasts />
    </Layout>
  )
}
`
}

for (const [rel, content] of Object.entries(files)) {
  const file = join(dir, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}
mkdirSync(join(dir, 'resources'), { recursive: true })
console.log(`✓ ${name} créé dans ${dir}`)
