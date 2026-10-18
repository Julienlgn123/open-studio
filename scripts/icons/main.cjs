// Génère resources/icon.png (512 px) des modules : un carré arrondi en dégradé et un pictogramme
// Lucide blanc, dans le même style pour tous. À lancer avec Electron :
//   npx electron scripts/icons/main.cjs [id…]
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..', '..')
const ICONS = {
  'ent-studio': ['calendar-days', '#fb923c', '#ea580c'],
  'quick-notes': ['notebook-pen', '#fde047', '#eab308'],
  'plan-studio': ['calendar-check', '#f472b6', '#db2777'],
  'pdf-studio': ['file-text', '#f87171', '#dc2626'],
  'convert-studio': ['repeat-2', '#2dd4bf', '#0d9488'],
  'paint-studio': ['palette', '#fb7185', '#e11d48'],
  'calc-studio': ['calculator', '#818cf8', '#4f46e5'],
  'monitor-studio': ['activity', '#22d3ee', '#0e7490'],
  'transfer-studio': ['send', '#38bdf8', '#0369a1'],
  'youtube-studio': ['youtube', '#ff5470', '#e11d48'],
  'snippets-studio': ['code-xml', '#a3e635', '#4d7c0f'],
  'api-studio': ['send-horizontal', '#fbbf24', '#d97706'],
  'devtools-studio': ['wrench', '#94a3b8', '#334155'],
  'servers-studio': ['server', '#4ade80', '#15803d']
}

/** Éléments SVG d'une icône Lucide, lus dans le paquet lucide-react. */
function lucide(name) {
  const src = readFileSync(join(root, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons', `${name}.js`), 'utf-8')
  const nodes = Function(`return ${/const __iconNode = (\[[\s\S]*?\]);/.exec(src)[1]}`)()
  return nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('')
}

function svg([glyph, c1, c2]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#s)"/>
  <g transform="translate(116 116) scale(11.667)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${lucide(glyph)}</g>
</svg>`
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const only = process.argv.slice(2).filter((a) => ICONS[a])
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  for (const [id, spec] of Object.entries(ICONS)) {
    if (only.length && !only.includes(id)) continue
    const dir = join(root, 'apps', id, 'resources')
    if (!existsSync(dir)) continue
    const html = `<html><body style="margin:0;background:transparent">${svg(spec)}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // La toute première capture peut sortir vide : on réessaie jusqu'à avoir l'image.
    let img
    for (let i = 0; i < 10 && (!img || img.isEmpty()); i++) {
      await new Promise((r) => setTimeout(r, 150))
      img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
    }
    writeFileSync(join(dir, 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG())
    writeFileSync(join(dir, 'icon.svg'), svg(spec))
  }
  app.exit(0)
})
