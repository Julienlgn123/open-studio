import { useEffect, useRef, useState } from 'react'
import { FileStack, FileText, FolderOpen, Layers, Minimize2, RotateCw, Scissors, Trash2, Upload, X } from 'lucide-react'
import { Empty, Layout, NavItem, Page, Progress, Segmented, SideTitle, Toasts, errorText, formatBytes, relativeTime, toast, useFileDrop, usePersisted } from '@ui'
import Viewer from './Viewer'
import { baseName, compress, fileName, fingerprint, merge, openForView, parseRanges, readPdf, rebuild, writePdf, type PdfJsDoc } from './pdf'
import './pdf.css'

type View = 'library' | 'merge' | 'split' | 'organize' | 'compress'
interface Recent {
  path: string
  pages: number
  size: number
  openedAt: number
}

const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }]

async function pickPdfs(multi = false): Promise<string[]> {
  return window.kit.files.open({ title: 'Choisir un PDF', filters: PDF_FILTER, multi })
}

async function saveAs(defaultPath: string, bytes: Uint8Array): Promise<void> {
  const target = await window.kit.files.save({ defaultPath, filters: PDF_FILTER })
  if (!target) return
  await writePdf(target, bytes)
  toast(`Enregistré : ${fileName(target)} (${formatBytes(bytes.length)})`, 'success')
  void window.kit.files.reveal(target)
}

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('library')
  const [recent, setRecent] = usePersisted<Recent[]>('recent', [])
  const [open, setOpen] = useState<{ path: string; bytes: Uint8Array; doc: PdfJsDoc; key: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const openPath = async (path: string): Promise<void> => {
    setLoading(true)
    try {
      const bytes = await readPdf(path)
      const doc = await openForView(bytes)
      setOpen({ path, bytes, doc, key: await fingerprint(bytes) })
      setRecent((r) => [{ path, pages: doc.numPages, size: bytes.length, openedAt: Date.now() }, ...r.filter((x) => x.path !== path)].slice(0, 40))
    } catch (err) {
      toast(`Impossible d’ouvrir ce PDF : ${errorText(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (open) return <Viewer path={open.path} bytes={open.bytes} doc={open.doc} docKey={open.key} onClose={() => setOpen(null)} />

  return (
    <Layout
      side={
        <>
          <SideTitle>PDF Studio</SideTitle>
          <NavItem icon={<FileText size={15} />} label="Mes PDF" active={view === 'library'} onClick={() => setView('library')} />
          <div className="ui-side-section">Outils</div>
          <NavItem icon={<Layers size={15} />} label="Fusionner" active={view === 'merge'} onClick={() => setView('merge')} />
          <NavItem icon={<Scissors size={15} />} label="Extraire des pages" active={view === 'split'} onClick={() => setView('split')} />
          <NavItem icon={<RotateCw size={15} />} label="Organiser les pages" active={view === 'organize'} onClick={() => setView('organize')} />
          <NavItem icon={<Minimize2 size={15} />} label="Compresser" active={view === 'compress'} onClick={() => setView('compress')} />
        </>
      }
    >
      {view === 'library' && <Library recent={recent} loading={loading} onOpen={openPath} onForget={(p) => setRecent((r) => r.filter((x) => x.path !== p))} />}
      {view === 'merge' && <MergeTool />}
      {view === 'split' && <SplitTool />}
      {view === 'organize' && <OrganizeTool />}
      {view === 'compress' && <CompressTool />}
      <Toasts />
    </Layout>
  )
}

function Library({ recent, loading, onOpen, onForget }: { recent: Recent[]; loading: boolean; onOpen: (p: string) => void; onForget: (p: string) => void }): JSX.Element {
  const drop = useFileDrop((paths) => {
    const pdf = paths.find((p) => /\.pdf$/i.test(p))
    if (pdf) onOpen(pdf)
  })
  return (
    <Page
      title="Mes PDF"
      sub="Ouvre un PDF pour le lire, le surligner, l’annoter ou le signer."
      tools={
        <button className="btn btn-primary" onClick={() => void pickPdfs().then((p) => p[0] && onOpen(p[0]))}>
          {loading ? <span className="spinner" /> : <FolderOpen size={14} />} Ouvrir un PDF
        </button>
      }
    >
      <div className={`ui-dropzone${drop.over ? ' over' : ''}`} {...drop.bind}>
        <Upload size={22} />
        Glisse un PDF ici pour l’ouvrir
      </div>
      {recent.length > 0 && (
        <>
          <h2 className="ui-section-title">Récents</h2>
          <div className="recent">
            {recent.map((r) => (
              <div key={r.path} className="recent-item" onClick={() => onOpen(r.path)} title={r.path}>
                <div className="recent-icon">
                  <FileText size={20} />
                </div>
                <div className="recent-main">
                  <b>{baseName(r.path)}</b>
                  <span className="faint">
                    {r.pages} page{r.pages > 1 ? 's' : ''} · {formatBytes(r.size)} · {relativeTime(r.openedAt)}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  title="Retirer de la liste"
                  onClick={(e) => {
                    e.stopPropagation()
                    onForget(r.path)
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}

// ─── Outils ────────────────────────────────────────────────────────────────────────────────

function MergeTool(): JSX.Element {
  const [files, setFiles] = useState<{ path: string; pages: number }[]>([])
  const [busy, setBusy] = useState(false)
  const add = async (paths: string[]): Promise<void> => {
    const items = await Promise.all(
      paths.filter((p) => /\.pdf$/i.test(p)).map(async (path) => ({ path, pages: (await openForView(await readPdf(path))).numPages }))
    )
    setFiles((f) => [...f, ...items])
  }
  const drop = useFileDrop((p) => void add(p))
  const move = (i: number, d: number): void =>
    setFiles((f) => {
      const n = [...f]
      const [x] = n.splice(i, 1)
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x)
      return n
    })
  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const bytes = await merge(await Promise.all(files.map((f) => readPdf(f.path))))
      await saveAs(files[0].path.replace(/[^\\/]+$/, 'fusion.pdf'), bytes)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page title="Fusionner des PDF" sub="Assemble plusieurs PDF en un seul, dans l’ordre de ton choix.">
      <div className={`ui-dropzone${drop.over ? ' over' : ''}`} {...drop.bind}>
        <FileStack size={22} />
        Glisse tes PDF ici
        <button className="btn btn-secondary btn-sm" onClick={() => void pickPdfs(true).then(add)}>
          Ajouter des PDF
        </button>
      </div>
      {files.length > 0 && (
        <div className="ui-card file-list">
          {files.map((f, i) => (
            <div key={f.path + i} className="file-row">
              <span className="file-num">{i + 1}</span>
              <span className="file-name">{fileName(f.path)}</span>
              <span className="faint">{f.pages} p.</span>
              <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="btn btn-ghost btn-sm" disabled={i === files.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="ui-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="faint">{files.reduce((n, f) => n + f.pages, 0)} pages au total</span>
            <button className="btn btn-primary" disabled={files.length < 2 || busy} onClick={() => void run()}>
              {busy && <span className="spinner" />}Fusionner
            </button>
          </div>
        </div>
      )}
    </Page>
  )
}

function useOnePdf(): { path: string | null; bytes: Uint8Array | null; doc: PdfJsDoc | null; pick: () => void; bind: ReturnType<typeof useFileDrop> } {
  const [state, setState] = useState<{ path: string; bytes: Uint8Array; doc: PdfJsDoc } | null>(null)
  const load = async (path: string): Promise<void> => {
    try {
      const bytes = await readPdf(path)
      setState({ path, bytes, doc: await openForView(bytes) })
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }
  const bind = useFileDrop((p) => {
    const pdf = p.find((x) => /\.pdf$/i.test(x))
    if (pdf) void load(pdf)
  })
  return { path: state?.path ?? null, bytes: state?.bytes ?? null, doc: state?.doc ?? null, pick: () => void pickPdfs().then((p) => { if (p[0]) void load(p[0]) }), bind }
}

function PickOne({ pdf }: { pdf: ReturnType<typeof useOnePdf> }): JSX.Element {
  return (
    <div className={`ui-dropzone${pdf.bind.over ? ' over' : ''}`} {...pdf.bind.bind}>
      <FileText size={22} />
      {pdf.path ? (
        <>
          <b>{fileName(pdf.path)}</b>
          <span className="faint">{pdf.doc?.numPages} pages</span>
        </>
      ) : (
        'Glisse un PDF ici'
      )}
      <button className="btn btn-secondary btn-sm" onClick={pdf.pick}>
        {pdf.path ? 'Choisir un autre PDF' : 'Choisir un PDF'}
      </button>
    </div>
  )
}

function SplitTool(): JSX.Element {
  const pdf = useOnePdf()
  const [ranges, setRanges] = useState('')
  const [each, setEach] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    if (!pdf.bytes || !pdf.doc || !pdf.path) return
    setBusy(true)
    try {
      if (each) {
        const dir = await window.kit.files.open({ title: 'Dossier où enregistrer les pages', directory: true })
        if (!dir[0]) return
        for (let i = 0; i < pdf.doc.numPages; i++) {
          await writePdf(`${dir[0]}/${baseName(pdf.path)} - page ${i + 1}.pdf`, await rebuild(pdf.bytes, [{ index: i, rotate: 0 }]))
        }
        toast(`${pdf.doc.numPages} fichiers enregistrés`, 'success')
        void window.kit.files.openPath(dir[0])
      } else {
        const idx = parseRanges(ranges, pdf.doc.numPages)
        await saveAs(pdf.path.replace(/\.pdf$/i, ` (pages ${ranges.replace(/\s/g, '')}).pdf`), await rebuild(pdf.bytes, idx.map((index) => ({ index, rotate: 0 }))))
      }
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page title="Extraire des pages" sub="Garde seulement les pages utiles, ou sépare chaque page dans son propre fichier.">
      <PickOne pdf={pdf} />
      {pdf.doc && (
        <div className="ui-card ui-col" style={{ marginTop: 14 }}>
          <Segmented<'ranges' | 'each'>
            value={each ? 'each' : 'ranges'}
            onChange={(v) => setEach(v === 'each')}
            options={[
              { id: 'ranges', label: 'Certaines pages' },
              { id: 'each', label: 'Une page par fichier' }
            ]}
          />
          {!each && (
            <div className="field">
              <label className="field-label">Pages à garder</label>
              <input className="input" placeholder="ex. 1-3, 5, 8-10" value={ranges} onChange={(e) => setRanges(e.target.value)} />
              <span className="field-hint">Sur {pdf.doc.numPages} pages. L’ordre que tu écris est respecté.</span>
            </div>
          )}
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy || (!each && !ranges.trim())} onClick={() => void run()}>
            {busy && <span className="spinner" />}
            {each ? 'Séparer les pages' : 'Extraire'}
          </button>
        </div>
      )}
    </Page>
  )
}

function Thumb({ doc, n, rotate }: { doc: PdfJsDoc; n: number; rotate: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    void doc.getPage(n).then((page) => {
      const vp = page.getViewport({ scale: 0.35 })
      const c = ref.current
      if (!c) return
      c.width = vp.width
      c.height = vp.height
      void page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise.catch(() => {})
    })
  }, [doc, n])
  return <canvas ref={ref} style={{ transform: `rotate(${rotate}deg)` }} />
}

function OrganizeTool(): JSX.Element {
  const pdf = useOnePdf()
  const [pages, setPages] = useState<{ index: number; rotate: number }[]>([])
  const [drag, setDrag] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (pdf.doc) setPages(Array.from({ length: pdf.doc.numPages }, (_, index) => ({ index, rotate: 0 })))
  }, [pdf.doc])
  const save = async (): Promise<void> => {
    if (!pdf.bytes || !pdf.path) return
    setBusy(true)
    try {
      await saveAs(pdf.path.replace(/\.pdf$/i, ' (réorganisé).pdf'), await rebuild(pdf.bytes, pages))
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page
      title="Organiser les pages"
      sub="Glisse les pages pour changer l’ordre, fais-les pivoter ou supprime celles en trop."
      tools={
        pdf.doc && (
          <button className="btn btn-primary" disabled={busy || !pages.length} onClick={() => void save()}>
            {busy && <span className="spinner" />}Enregistrer le PDF
          </button>
        )
      }
    >
      {!pdf.doc ? (
        <PickOne pdf={pdf} />
      ) : (
        <div className="organize">
          {pages.map((p, i) => (
            <div
              key={`${p.index}-${i}`}
              className={`org-page${drag === i ? ' dragging' : ''}`}
              draggable
              onDragStart={() => setDrag(i)}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => {
                e.preventDefault()
                if (drag === null || drag === i) return
                setPages((all) => {
                  const n = [...all]
                  const [x] = n.splice(drag, 1)
                  n.splice(i, 0, x)
                  return n
                })
                setDrag(i)
              }}
            >
              <Thumb doc={pdf.doc!} n={p.index + 1} rotate={p.rotate} />
              <div className="org-bar">
                <span>{i + 1}</span>
                <button className="btn btn-ghost btn-sm btn-icon" title="Pivoter" onClick={() => setPages((all) => all.map((x, j) => (j === i ? { ...x, rotate: (x.rotate + 90) % 360 } : x)))}>
                  <RotateCw size={13} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Supprimer" onClick={() => setPages((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

function CompressTool(): JSX.Element {
  const pdf = useOnePdf()
  const [mode, setMode] = useState<'light' | 'strong'>('light')
  const [quality, setQuality] = useState(0.6)
  const [progress, setProgress] = useState<number | null>(null)
  const run = async (): Promise<void> => {
    if (!pdf.bytes || !pdf.path) return
    setProgress(0)
    try {
      const out = await compress(pdf.bytes, mode, quality, setProgress)
      const gain = 1 - out.length / pdf.bytes.length
      if (gain <= 0.01) toast('Ce PDF est déjà bien optimisé : essaie la compression forte.', 'info')
      else await saveAs(pdf.path.replace(/\.pdf$/i, ' (compressé).pdf'), out)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setProgress(null)
    }
  }
  return (
    <Page title="Compresser" sub="Réduis la taille d’un PDF pour l’envoyer par mail ou le déposer sur l’ENT.">
      <PickOne pdf={pdf} />
      {pdf.doc && pdf.bytes && (
        <div className="ui-card ui-col" style={{ marginTop: 14 }}>
          <div className="faint">Taille actuelle : {formatBytes(pdf.bytes.length)}</div>
          <Segmented<'light' | 'strong'>
            value={mode}
            onChange={setMode}
            options={[
              { id: 'light', label: 'Légère (sans perte)' },
              { id: 'strong', label: 'Forte (scans, photos)' }
            ]}
          />
          {mode === 'strong' && (
            <>
              <div className="field">
                <label className="field-label">Qualité des images : {Math.round(quality * 100)} %</label>
                <input type="range" min={0.3} max={0.9} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
              </div>
              <div className="callout warn">
                <Minimize2 size={15} />
                <span>Chaque page devient une image : idéal pour un scan, mais le texte ne pourra plus être sélectionné ou copié.</span>
              </div>
            </>
          )}
          {progress !== null && <Progress ratio={progress} />}
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={progress !== null} onClick={() => void run()}>
            {progress !== null && <span className="spinner" />}Compresser
          </button>
        </div>
      )}
    </Page>
  )
}
