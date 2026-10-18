import { useEffect, useState } from 'react'
import { CheckCircle2, FileAudio, FileImage, FileVideo, FolderOpen, Play, Repeat2, Trash2, Upload, X, XCircle } from 'lucide-react'
import { Layout, Page, Progress, Segmented, Toasts, formatBytes, toast, useFileDrop, usePersisted } from '@ui'
import { INPUT_KIND, TARGETS, extOf, targetsFor, type Job, type Kind } from '../../shared/formats'
import './convert.css'

interface Pending {
  path: string
  kind: Kind | undefined
  target: string
}

const DEFAULT_TARGET: Record<Kind, string> = { video: 'mp4', audio: 'mp3', image: 'png' }
const KIND_ICON: Record<Kind, JSX.Element> = { video: <FileVideo size={18} />, audio: <FileAudio size={18} />, image: <FileImage size={18} /> }
const name = (p: string): string => p.split(/[\\/]/).pop() ?? p

// Raccourcis tout prêts pour les besoins les plus courants.
const PRESETS: { label: string; from: Kind; to: string }[] = [
  { label: 'Vidéo → MP3', from: 'video', to: 'mp3' },
  { label: 'Vidéo → MP4 léger', from: 'video', to: 'mp4' },
  { label: 'Vidéo → GIF', from: 'video', to: 'gif' },
  { label: 'Image → PNG', from: 'image', to: 'png' },
  { label: 'Image → JPG', from: 'image', to: 'jpg' },
  { label: 'Audio → MP3', from: 'audio', to: 'mp3' }
]

export default function App(): JSX.Element {
  const [pending, setPending] = useState<Pending[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [quality, setQuality] = usePersisted<'0' | '1' | '2'>('quality', '1')
  const [outDir, setOutDir] = usePersisted<string | null>('outDir', null)

  useEffect(() => {
    window.kit.invoke<Job[]>('convert:jobs').then(setJobs)
    return window.kit.on('convert:jobs', (j: Job[]) => setJobs([...j]))
  }, [])

  const add = (paths: string[]): void => {
    const items = paths.map((path) => {
      const kind = INPUT_KIND[extOf(path)]
      return { path, kind, target: kind ? DEFAULT_TARGET[kind] : '' }
    })
    const unknown = items.filter((i) => !i.kind).length
    if (unknown) toast(`${unknown} fichier${unknown > 1 ? 's' : ''} ignoré${unknown > 1 ? 's' : ''} : format inconnu`, 'error')
    setPending((p) => [...p, ...items.filter((i) => i.kind && !p.some((x) => x.path === i.path))])
  }
  const drop = useFileDrop(add)

  const pick = async (): Promise<void> =>
    add(
      await window.kit.files.open({
        title: 'Fichiers à convertir',
        multi: true,
        filters: [{ name: 'Vidéos, sons, images', extensions: Object.keys(INPUT_KIND) }]
      })
    )

  const start = async (): Promise<void> => {
    await window.kit.invoke('convert:add', pending.map((p) => ({ path: p.path, target: p.target })), Number(quality), outDir)
    setPending([])
  }

  const applyAll = (target: string): void => {
    const t = TARGETS.find((x) => x.id === target)
    setPending((p) => p.map((x) => (targetsFor(x.kind).some((y) => y.id === target) ? { ...x, target } : x)))
    if (t) toast(`Tous les fichiers compatibles → ${t.label}`, 'info')
  }

  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'error').length

  return (
    <Layout>
      <Page title="Convertisseur" sub="Glisse tes fichiers, choisis le format : tout se fait sur ton PC, rien n’est envoyé sur Internet.">
        <div className={`ui-dropzone big${drop.over ? ' over' : ''}`} {...drop.bind}>
          <Upload size={26} />
          <b>Glisse ici tes vidéos, sons ou images</b>
          <span className="faint">MP4, MOV, MKV, MP3, WAV, PNG, JPG, WebP, HEIC… plusieurs fichiers à la fois</span>
          <button className="btn btn-secondary btn-sm" onClick={() => void pick()}>
            Choisir des fichiers
          </button>
        </div>

        {pending.length > 0 && (
          <div className="ui-card pending">
            <div className="ui-row presets">
              <span className="faint">Tout convertir en :</span>
              {PRESETS.filter((p) => pending.some((x) => x.kind === p.from)).map((p) => (
                <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => applyAll(p.to)}>
                  {p.label}
                </button>
              ))}
            </div>
            {pending.map((p, i) => (
              <div key={p.path} className="pending-row">
                <span className={`kind-icon ${p.kind}`}>{p.kind && KIND_ICON[p.kind]}</span>
                <span className="pending-name" title={p.path}>
                  {name(p.path)}
                </span>
                <Repeat2 size={14} className="faint" />
                <select className="select" value={p.target} onChange={(e) => setPending((all) => all.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}>
                  {targetsFor(p.kind).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPending((all) => all.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="pending-foot">
              <div className="field">
                <span className="field-label">Qualité</span>
                <Segmented
                  value={quality}
                  onChange={setQuality}
                  options={[
                    { id: '0', label: 'Petite taille' },
                    { id: '1', label: 'Équilibrée' },
                    { id: '2', label: 'Meilleure qualité' }
                  ]}
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 0 }}>
                <span className="field-label">Enregistrer dans</span>
                <div className="ui-row">
                  <button
                    className="btn btn-secondary btn-sm out-dir"
                    title={outDir ?? undefined}
                    onClick={() => void window.kit.files.open({ directory: true, title: 'Dossier de destination' }).then((d) => d[0] && setOutDir(d[0]))}
                  >
                    <FolderOpen size={13} /> {outDir ? name(outDir) : 'Le même dossier que chaque fichier'}
                  </button>
                  {outDir && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setOutDir(null)}>
                      Réinitialiser
                    </button>
                  )}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => void start()}>
                <Play size={14} fill="currentColor" /> Convertir {pending.length > 1 ? `${pending.length} fichiers` : ''}
              </button>
            </div>
          </div>
        )}

        {jobs.length > 0 && (
          <>
            <div className="ui-row" style={{ justifyContent: 'space-between' }}>
              <h2 className="ui-section-title">Conversions</h2>
              {finished > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.invoke('convert:clear')}>
                  <Trash2 size={13} /> Effacer la liste
                </button>
              )}
            </div>
            <div className="ui-col">
              {[...jobs].reverse().map((j) => {
                const t = TARGETS.find((x) => x.id === j.target)
                const gain = j.outSize != null ? Math.round((1 - j.outSize / j.inSize) * 100) : null
                return (
                  <div key={j.id} className={`job ${j.status}`}>
                    <span className="job-status">
                      {j.status === 'done' ? <CheckCircle2 size={18} /> : j.status === 'error' ? <XCircle size={18} /> : <span className="spinner" />}
                    </span>
                    <div className="job-main">
                      <div className="job-name">
                        {name(j.input)} <span className="faint">→ {t?.label}</span>
                      </div>
                      {j.status === 'running' && <Progress ratio={j.progress} />}
                      {j.status === 'waiting' && <span className="faint">En attente…</span>}
                      {j.status === 'error' && <span className="job-error">{j.error}</span>}
                      {j.status === 'done' && (
                        <span className="faint">
                          {formatBytes(j.inSize)} → <b>{formatBytes(j.outSize)}</b>
                          {gain != null && gain > 0 && <span className="gain"> (−{gain} %)</span>}
                        </span>
                      )}
                    </div>
                    {j.status === 'done' && j.output && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.files.openPath(j.output!)}>
                          Ouvrir
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.reveal(j.output!)}>
                          Afficher
                        </button>
                      </>
                    )}
                    {(j.status === 'running' || j.status === 'waiting') && (
                      <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.invoke('convert:cancel', j.id)}>
                        Annuler
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Page>
      <Toasts />
    </Layout>
  )
}
