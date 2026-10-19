import { useEffect, useState } from 'react'
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField, StandardFonts, degrees, rgb } from 'pdf-lib'
import { ArrowDown, ArrowUp, Copy, FileImage, Images, X } from 'lucide-react'
import { Page, Progress, Segmented, Switch, errorText, formatBytes, toast, useFileDrop, usePersisted } from '@ui'
import { b64ToBytes, baseName, fileName, openForView, readPdf, writePdf, type PdfJsDoc } from './pdf'

// Outils ajoutés : images → PDF, PDF → images, filigrane, numéros de page, texte, métadonnées, formulaires.

const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }]
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif']

async function saveAs(defaultPath: string, bytes: Uint8Array): Promise<void> {
  const target = await window.kit.files.save({ defaultPath, filters: PDF_FILTER })
  if (!target) return
  await writePdf(target, bytes)
  toast(`Enregistré : ${fileName(target)} (${formatBytes(bytes.length)})`, 'success')
  void window.kit.files.reveal(target)
}

function hex(color: string): ReturnType<typeof rgb> {
  const n = parseInt(color.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Un PDF choisi ou glissé, avec son document pdf.js. */
function useOne(): { path: string | null; bytes: Uint8Array | null; doc: PdfJsDoc | null; pick: () => void; drop: ReturnType<typeof useFileDrop> } {
  const [st, setSt] = useState<{ path: string; bytes: Uint8Array; doc: PdfJsDoc } | null>(null)
  const load = async (path: string): Promise<void> => {
    try {
      const bytes = await readPdf(path)
      setSt({ path, bytes, doc: await openForView(bytes) })
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }
  const drop = useFileDrop((p) => {
    const pdf = p.find((x) => /\.pdf$/i.test(x))
    if (pdf) void load(pdf)
  })
  return {
    path: st?.path ?? null,
    bytes: st?.bytes ?? null,
    doc: st?.doc ?? null,
    pick: () => void window.kit.files.open({ title: 'Choisir un PDF', filters: PDF_FILTER }).then((p) => p[0] && void load(p[0])),
    drop
  }
}
function Pick({ pdf }: { pdf: ReturnType<typeof useOne> }): JSX.Element {
  return (
    <div className={`ui-dropzone${pdf.drop.over ? ' over' : ''}`} {...pdf.drop.bind}>
      {pdf.path ? (
        <>
          <b>{fileName(pdf.path)}</b>
          <span className="faint">
            {pdf.doc?.numPages} pages · {formatBytes(pdf.bytes?.length)}
          </span>
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

// ─── Images → PDF ──────────────────────────────────────────────────────────────────────────

const PAGE_SIZES: Record<string, [number, number] | null> = { a4: [595.28, 841.89], letter: [612, 792], a5: [419.53, 595.28], fit: null }

/** Image du disque → JPEG ou PNG que pdf-lib sait intégrer (WebP, BMP, GIF passent par un canvas). */
async function loadImage(path: string): Promise<{ bytes: Uint8Array; png: boolean; w: number; h: number }> {
  const ext = path.split('.').pop()!.toLowerCase()
  const b64 = await window.kit.files.readBase64(path)
  const img = new Image()
  img.src = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`
  await img.decode()
  if (ext === 'jpg' || ext === 'jpeg') return { bytes: b64ToBytes(b64), png: false, w: img.naturalWidth, h: img.naturalHeight }
  if (ext === 'png') return { bytes: b64ToBytes(b64), png: true, w: img.naturalWidth, h: img.naturalHeight }
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  return { bytes: b64ToBytes(c.toDataURL('image/png').split(',')[1]), png: true, w: c.width, h: c.height }
}

export function ImagesToPdf(): JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [size, setSize] = usePersisted<string>('imgPdfSize', 'a4')
  const [margin, setMargin] = usePersisted('imgPdfMargin', 20)
  const [progress, setProgress] = useState<number | null>(null)
  const add = (paths: string[]): void => setFiles((f) => [...f, ...paths.filter((p) => IMG_EXT.includes(p.split('.').pop()!.toLowerCase()))])
  const drop = useFileDrop(add)
  const move = (i: number, d: number): void =>
    setFiles((f) => {
      const n = [...f]
      const [x] = n.splice(i, 1)
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x)
      return n
    })
  const run = async (): Promise<void> => {
    setProgress(0)
    try {
      const doc = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        const im = await loadImage(files[i])
        const emb = im.png ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes)
        const fixed = PAGE_SIZES[size]
        // Page portrait ou paysage selon l'image.
        const [pw, ph] = fixed ? (im.w > im.h ? [fixed[1], fixed[0]] : fixed) : [im.w * 0.75, im.h * 0.75]
        const m = fixed ? margin : 0
        const s = Math.min((pw - 2 * m) / im.w, (ph - 2 * m) / im.h)
        const page = doc.addPage([pw, ph])
        page.drawImage(emb, { x: (pw - im.w * s) / 2, y: (ph - im.h * s) / 2, width: im.w * s, height: im.h * s })
        setProgress((i + 1) / files.length)
      }
      await saveAs(files[0].replace(/[^\\/]+$/, 'images.pdf'), await doc.save())
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setProgress(null)
    }
  }
  return (
    <Page title="Images → PDF" sub="Assemble des photos, scans ou captures en un seul PDF (une image par page).">
      <div className={`ui-dropzone${drop.over ? ' over' : ''}`} {...drop.bind}>
        <Images size={22} />
        Glisse tes images ici (JPG, PNG, WebP…)
        <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.files.open({ multi: true, title: 'Images', filters: [{ name: 'Images', extensions: IMG_EXT }] }).then(add)}>
          Ajouter des images
        </button>
      </div>
      {files.length > 0 && (
        <div className="ui-card file-list">
          {files.map((f, i) => (
            <div key={f + i} className="file-row">
              <span className="file-num">{i + 1}</span>
              <span className="file-name">{fileName(f)}</span>
              <button className="btn btn-ghost btn-sm btn-icon" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={13} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" disabled={i === files.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={13} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="ui-row wrap-row" style={{ marginTop: 10 }}>
            <Segmented value={size} onChange={setSize} options={[{ id: 'a4', label: 'A4' }, { id: 'a5', label: 'A5' }, { id: 'letter', label: 'Lettre US' }, { id: 'fit', label: 'Taille de l’image' }]} />
            {size !== 'fit' && (
              <label className="ui-row faint">
                Marges <input type="range" min={0} max={60} value={margin} onChange={(e) => setMargin(Number(e.target.value))} /> <b>{margin} pt</b>
              </label>
            )}
            <div className="spacer" />
            <button className="btn btn-primary" disabled={progress !== null} onClick={() => void run()}>
              {progress !== null && <span className="spinner" />}Créer le PDF
            </button>
          </div>
          {progress !== null && <Progress ratio={progress} />}
        </div>
      )}
    </Page>
  )
}

// ─── PDF → images ──────────────────────────────────────────────────────────────────────────

export function PdfToImages(): JSX.Element {
  const pdf = useOne()
  const [fmt, setFmt] = usePersisted<'png' | 'jpg'>('toImgFmt', 'png')
  const [dpi, setDpi] = usePersisted('toImgDpi', 150)
  const [ranges, setRanges] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const run = async (): Promise<void> => {
    if (!pdf.doc || !pdf.path) return
    const [dir] = await window.kit.files.open({ title: 'Dossier où enregistrer les images', directory: true })
    if (!dir) return
    setProgress(0)
    try {
      const pages: number[] = []
      if (ranges.trim()) {
        for (const part of ranges.split(/[,;\s]+/).filter(Boolean)) {
          const m = /^(\d+)(?:-(\d+))?$/.exec(part)
          if (!m) throw new Error(`« ${part} » n’est pas une page ni une plage.`)
          for (let i = Number(m[1]); i <= Number(m[2] ?? m[1]); i++) if (i >= 1 && i <= pdf.doc.numPages) pages.push(i)
        }
      } else for (let i = 1; i <= pdf.doc.numPages; i++) pages.push(i)
      for (let k = 0; k < pages.length; k++) {
        const page = await pdf.doc.getPage(pages[k])
        const vp = page.getViewport({ scale: dpi / 72 })
        const c = document.createElement('canvas')
        c.width = vp.width
        c.height = vp.height
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        const data = c.toDataURL(fmt === 'png' ? 'image/png' : 'image/jpeg', 0.9).split(',')[1]
        await window.kit.files.writeBase64(`${dir}/${baseName(pdf.path)} - page ${String(pages[k]).padStart(String(pdf.doc.numPages).length, '0')}.${fmt}`, data)
        setProgress((k + 1) / pages.length)
      }
      toast(`${pages.length} image${pages.length > 1 ? 's' : ''} enregistrée${pages.length > 1 ? 's' : ''}`, 'success')
      void window.kit.files.openPath(dir)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setProgress(null)
    }
  }
  return (
    <Page title="PDF → images" sub="Chaque page devient une image (pour une présentation, un réseau social, un montage…).">
      <Pick pdf={pdf} />
      {pdf.doc && (
        <div className="ui-card ui-col" style={{ marginTop: 14 }}>
          <div className="ui-row wrap-row">
            <Segmented value={fmt} onChange={setFmt} options={[{ id: 'png', label: 'PNG (net)' }, { id: 'jpg', label: 'JPG (léger)' }]} />
            <Segmented value={String(dpi) as '150'} onChange={(v) => setDpi(Number(v))} options={[{ id: '72', label: 'Écran' }, { id: '150', label: 'Normal' }, { id: '300', label: 'Impression' }]} />
          </div>
          <div className="field">
            <label className="field-label">Pages (vide = toutes)</label>
            <input className="input" placeholder="ex. 1-3, 7" value={ranges} onChange={(e) => setRanges(e.target.value)} />
          </div>
          {progress !== null && <Progress ratio={progress} />}
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={progress !== null} onClick={() => void run()}>
            <FileImage size={14} /> Exporter les images
          </button>
        </div>
      )}
    </Page>
  )
}

// ─── Filigrane ─────────────────────────────────────────────────────────────────────────────

export function Watermark(): JSX.Element {
  const pdf = useOne()
  const [text, setText] = usePersisted('wmText', 'CONFIDENTIEL')
  const [color, setColor] = usePersisted('wmColor', '#ef4444')
  const [opacity, setOpacity] = usePersisted('wmOpacity', 0.18)
  const [size, setSize] = usePersisted('wmSize', 64)
  const [diag, setDiag] = usePersisted('wmDiag', true)
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    if (!pdf.bytes || !pdf.path) return
    setBusy(true)
    try {
      const doc = await PDFDocument.load(pdf.bytes, { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize()
        const w = font.widthOfTextAtSize(text, size)
        const angle = diag ? Math.atan2(height, width) : 0
        const cx = width / 2 - (Math.cos(angle) * w) / 2 + (Math.sin(angle) * size) / 3
        const cy = height / 2 - (Math.sin(angle) * w) / 2 - (Math.cos(angle) * size) / 3
        page.drawText(text, { x: cx, y: cy, size, font, color: hex(color), opacity, rotate: degrees((angle * 180) / Math.PI) })
      }
      await saveAs(pdf.path.replace(/\.pdf$/i, ' (filigrane).pdf'), await doc.save())
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page title="Filigrane" sub="Ajoute un texte en transparence sur toutes les pages (BROUILLON, COPIE, ton nom…).">
      <Pick pdf={pdf} />
      {pdf.doc && (
        <div className="ui-card ui-col" style={{ marginTop: 14 }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Texte du filigrane" />
          <div className="ui-row wrap-row">
            <label className="ui-row faint">
              Couleur <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="ui-row faint">
              Opacité <input type="range" min={0.05} max={0.8} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /> <b>{Math.round(opacity * 100)} %</b>
            </label>
            <label className="ui-row faint">
              Taille <input type="range" min={16} max={140} value={size} onChange={(e) => setSize(Number(e.target.value))} /> <b>{size}</b>
            </label>
            <label className="ui-row faint">
              <Switch on={diag} onChange={setDiag} /> En diagonale
            </label>
          </div>
          <div className="wm-preview">
            <span style={{ color, opacity, fontSize: size / 4, transform: diag ? 'rotate(-54deg)' : undefined }}>{text}</span>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !text.trim()} onClick={() => void run()}>
            {busy && <span className="spinner" />}Appliquer à toutes les pages
          </button>
        </div>
      )}
    </Page>
  )
}

// ─── Numéros de page ───────────────────────────────────────────────────────────────────────

type NumPos = 'bc' | 'br' | 'bl' | 'tc' | 'tr' | 'tl'
export function PageNumbers(): JSX.Element {
  const pdf = useOne()
  const [pos, setPos] = usePersisted<NumPos>('numPos', 'bc')
  const [format, setFormat] = usePersisted<'n' | 'n/N' | 'page'>('numFormat', 'n/N')
  const [start, setStart] = usePersisted('numStart', 1)
  const [skipFirst, setSkipFirst] = usePersisted('numSkip', false)
  const [size, setSize] = usePersisted('numSize', 10)
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    if (!pdf.bytes || !pdf.path) return
    setBusy(true)
    try {
      const doc = await PDFDocument.load(pdf.bytes, { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const pages = doc.getPages()
      const total = pages.length - (skipFirst ? 1 : 0) + start - 1
      pages.forEach((page, i) => {
        if (skipFirst && i === 0) return
        const n = i + start - (skipFirst ? 1 : 0)
        const text = format === 'n' ? String(n) : format === 'n/N' ? `${n} / ${total}` : `Page ${n} sur ${total}`
        const { width, height } = page.getSize()
        const w = font.widthOfTextAtSize(text, size)
        const m = 28
        const x = pos.endsWith('l') ? m : pos.endsWith('r') ? width - m - w : (width - w) / 2
        const y = pos.startsWith('b') ? m - size / 2 + 4 : height - m
        page.drawText(text, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) })
      })
      await saveAs(pdf.path.replace(/\.pdf$/i, ' (numéroté).pdf'), await doc.save())
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const POS: [NumPos, string][] = [
    ['tl', 'Haut gauche'],
    ['tc', 'Haut centre'],
    ['tr', 'Haut droite'],
    ['bl', 'Bas gauche'],
    ['bc', 'Bas centre'],
    ['br', 'Bas droite']
  ]
  return (
    <Page title="Numéroter les pages" sub="Pratique pour un rapport, un mémoire ou un dossier à imprimer.">
      <Pick pdf={pdf} />
      {pdf.doc && (
        <div className="ui-card ui-col" style={{ marginTop: 14 }}>
          <div className="pos-grid">
            {POS.map(([id, label]) => (
              <button key={id} className={`pos${pos === id ? ' on' : ''}`} onClick={() => setPos(id)} title={label}>
                <span />
              </button>
            ))}
          </div>
          <div className="ui-row wrap-row">
            <Segmented value={format} onChange={setFormat} options={[{ id: 'n', label: '3' }, { id: 'n/N', label: '3 / 12' }, { id: 'page', label: 'Page 3 sur 12' }]} />
            <label className="ui-row faint">
              Commencer à <input className="input" type="number" min={0} style={{ width: 70 }} value={start} onChange={(e) => setStart(Number(e.target.value) || 1)} />
            </label>
            <label className="ui-row faint">
              Taille <input type="range" min={7} max={18} value={size} onChange={(e) => setSize(Number(e.target.value))} /> <b>{size}</b>
            </label>
            <label className="ui-row faint">
              <Switch on={skipFirst} onChange={setSkipFirst} /> Pas de numéro sur la page de garde
            </label>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void run()}>
            {busy && <span className="spinner" />}Numéroter
          </button>
        </div>
      )}
    </Page>
  )
}

// ─── Texte ─────────────────────────────────────────────────────────────────────────────────

export function ExtractText(): JSX.Element {
  const pdf = useOne()
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  useEffect(() => {
    if (!pdf.doc) return
    let alive = true
    setProgress(0)
    void (async () => {
      const parts: string[] = []
      for (let i = 1; i <= pdf.doc!.numPages && alive; i++) {
        const content = await (await pdf.doc!.getPage(i)).getTextContent()
        let line = ''
        let lastY: number | null = null
        const lines: string[] = []
        for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
          const y = item.transform?.[5]
          if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
            lines.push(line)
            line = ''
          }
          line += item.str
          if (item.hasEOL) {
            lines.push(line)
            line = ''
          }
          lastY = y ?? lastY
        }
        if (line) lines.push(line)
        parts.push(`── Page ${i} ──\n${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}`)
        setProgress(i / pdf.doc!.numPages)
      }
      if (alive) {
        setText(parts.join('\n\n'))
        setProgress(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [pdf.doc])
  const words = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0
  return (
    <Page title="Extraire le texte" sub="Récupère tout le texte du PDF (pour le copier, le traduire, le résumer…). Un PDF scanné n’a pas de texte à extraire.">
      <Pick pdf={pdf} />
      {progress !== null && <Progress ratio={progress} />}
      {text && (
        <div className="ui-col" style={{ marginTop: 14 }}>
          <div className="ui-row">
            <span className="faint">
              {words.toLocaleString('fr-FR')} mots · {text.length.toLocaleString('fr-FR')} caractères
            </span>
            <div className="spacer" />
            <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.clipboard.write(text).then(() => toast('Texte copié', 'success'))}>
              <Copy size={13} /> Copier
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                void window.kit.files.save({ defaultPath: pdf.path!.replace(/\.pdf$/i, '.txt'), filters: [{ name: 'Texte', extensions: ['txt'] }] }).then(async (p) => {
                  if (!p) return
                  await window.kit.files.writeText(p, text)
                  toast('Texte enregistré', 'success')
                })
              }
            >
              Enregistrer en .txt
            </button>
          </div>
          <textarea className="textarea mono" rows={18} value={text} readOnly />
        </div>
      )}
      {!text && pdf.doc && progress === null && <p className="faint">Aucun texte trouvé : ce PDF est sans doute un scan (une image).</p>}
    </Page>
  )
}

// ─── Métadonnées ───────────────────────────────────────────────────────────────────────────

export function Metadata(): JSX.Element {
  const pdf = useOne()
  const [meta, setMeta] = useState({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' })
  const [info, setInfo] = useState<{ created?: Date; modified?: Date; pages: number } | null>(null)
  useEffect(() => {
    if (!pdf.bytes) return
    void PDFDocument.load(pdf.bytes, { ignoreEncryption: true, updateMetadata: false }).then((d) => {
      setMeta({
        title: d.getTitle() ?? '',
        author: d.getAuthor() ?? '',
        subject: d.getSubject() ?? '',
        keywords: d.getKeywords() ?? '',
        creator: d.getCreator() ?? '',
        producer: d.getProducer() ?? ''
      })
      setInfo({ created: d.getCreationDate(), modified: d.getModificationDate(), pages: d.getPageCount() })
    })
  }, [pdf.bytes])
  const save = async (clear = false): Promise<void> => {
    if (!pdf.bytes || !pdf.path) return
    try {
      const d = await PDFDocument.load(pdf.bytes, { ignoreEncryption: true, updateMetadata: false })
      const m = clear ? { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' } : meta
      d.setTitle(m.title)
      d.setAuthor(m.author)
      d.setSubject(m.subject)
      d.setKeywords(m.keywords.split(/[,;]\s*/).filter(Boolean))
      d.setCreator(m.creator)
      d.setProducer(m.producer)
      d.setModificationDate(new Date())
      await saveAs(pdf.path.replace(/\.pdf$/i, clear ? ' (anonyme).pdf' : ' (infos).pdf'), await d.save())
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }
  const fields: [keyof typeof meta, string][] = [
    ['title', 'Titre'],
    ['author', 'Auteur'],
    ['subject', 'Sujet'],
    ['keywords', 'Mots-clés (séparés par des virgules)'],
    ['creator', 'Logiciel de création'],
    ['producer', 'Producteur']
  ]
  return (
    <Page title="Informations du PDF" sub="Titre, auteur, mots-clés… ce que montrent les propriétés du fichier et les moteurs de recherche.">
      <Pick pdf={pdf} />
      {pdf.doc && (
        <div className="ui-card ui-col" style={{ marginTop: 14 }}>
          {fields.map(([k, label]) => (
            <label key={k} className="field">
              <span className="field-label">{label}</span>
              <input className="input" value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />
            </label>
          ))}
          {info && (
            <p className="faint">
              {info.pages} pages{info.created ? ` · créé le ${info.created.toLocaleDateString('fr-FR')}` : ''}
              {info.modified ? ` · modifié le ${info.modified.toLocaleDateString('fr-FR')}` : ''}
            </p>
          )}
          <div className="ui-row">
            <button className="btn btn-primary" onClick={() => void save()}>
              Enregistrer une copie
            </button>
            <button className="btn btn-ghost" onClick={() => void save(true)} title="Retire auteur, logiciel, etc. avant de partager">
              Copie sans aucune info
            </button>
          </div>
        </div>
      )}
    </Page>
  )
}

// ─── Formulaires ───────────────────────────────────────────────────────────────────────────

type Field = { name: string; kind: 'text' | 'check' | 'choice' | 'radio'; value: string | boolean; options?: string[]; multiline?: boolean }

export function FormFill(): JSX.Element {
  const pdf = useOne()
  const [fields, setFields] = useState<Field[] | null>(null)
  const [flatten, setFlatten] = useState(false)
  useEffect(() => {
    if (!pdf.bytes) return
    void PDFDocument.load(pdf.bytes, { ignoreEncryption: true }).then((d) => {
      const out: Field[] = []
      for (const f of d.getForm().getFields()) {
        const name = f.getName()
        if (f instanceof PDFTextField) out.push({ name, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline() })
        else if (f instanceof PDFCheckBox) out.push({ name, kind: 'check', value: f.isChecked() })
        else if (f instanceof PDFDropdown) out.push({ name, kind: 'choice', value: f.getSelected()[0] ?? '', options: f.getOptions() })
        else if (f instanceof PDFRadioGroup) out.push({ name, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() })
      }
      setFields(out)
    })
  }, [pdf.bytes])
  const save = async (): Promise<void> => {
    if (!pdf.bytes || !pdf.path || !fields) return
    try {
      const d = await PDFDocument.load(pdf.bytes, { ignoreEncryption: true })
      const form = d.getForm()
      for (const f of fields) {
        const field = form.getField(f.name)
        if (field instanceof PDFTextField) field.setText(String(f.value))
        else if (field instanceof PDFCheckBox) (f.value ? field.check() : field.uncheck())
        else if (field instanceof PDFDropdown && f.value) field.select(String(f.value))
        else if (field instanceof PDFRadioGroup && f.value) field.select(String(f.value))
      }
      if (flatten) form.flatten()
      await saveAs(pdf.path.replace(/\.pdf$/i, ' (rempli).pdf'), await d.save())
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }
  const set = (i: number, value: string | boolean): void => setFields((all) => all!.map((f, j) => (j === i ? { ...f, value } : f)))
  const pretty = (n: string): string => n.replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return (
    <Page title="Remplir un formulaire" sub="Pour les PDF à champs (CERFA, inscriptions, contrats) : remplis-les ici, sans imprimer.">
      <Pick pdf={pdf} />
      {fields && !fields.length && <p className="faint" style={{ marginTop: 12 }}>Ce PDF n’a pas de champs à remplir. Utilise plutôt l’outil Texte du lecteur pour écrire dessus.</p>}
      {fields && fields.length > 0 && (
        <div className="ui-card ui-col form-fields" style={{ marginTop: 14 }}>
          {fields.map((f, i) => (
            <label key={f.name} className={f.kind === 'check' ? 'ui-row' : 'field'}>
              {f.kind === 'check' ? (
                <>
                  <input type="checkbox" checked={!!f.value} onChange={(e) => set(i, e.target.checked)} /> {pretty(f.name)}
                </>
              ) : (
                <>
                  <span className="field-label">{pretty(f.name)}</span>
                  {f.kind === 'text' &&
                    (f.multiline ? (
                      <textarea className="textarea" rows={3} value={String(f.value)} onChange={(e) => set(i, e.target.value)} />
                    ) : (
                      <input className="input" value={String(f.value)} onChange={(e) => set(i, e.target.value)} />
                    ))}
                  {(f.kind === 'choice' || f.kind === 'radio') && (
                    <select className="select" value={String(f.value)} onChange={(e) => set(i, e.target.value)}>
                      <option value="">—</option>
                      {f.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </label>
          ))}
          <label className="ui-row faint">
            <Switch on={flatten} onChange={setFlatten} /> Figer les réponses (plus modifiables ensuite)
          </label>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void save()}>
            Enregistrer le PDF rempli
          </button>
        </div>
      )}
    </Page>
  )
}
