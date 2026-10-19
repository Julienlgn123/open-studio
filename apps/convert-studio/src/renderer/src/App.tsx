import { useEffect, useState } from 'react'
import { Bookmark, CheckCircle2, FileAudio, FileImage, FileVideo, FolderOpen, Play, Repeat2, RotateCw, SlidersHorizontal, Trash2, Upload, X, XCircle } from 'lucide-react'
import { Layout, Page, Progress, Segmented, Toasts, formatBytes, toast, useFileDrop, usePersisted, usePrompt } from '@ui'
import { INPUT_KIND, TARGETS, extOf, fmtTime, hasOpts, targetsFor, type ConvOpts, type Job, type Kind, type MediaInfo } from '../../shared/formats'
import './convert.css'

interface Pending {
  path: string
  kind: Kind | undefined
  target: string
  opts: ConvOpts
  info?: MediaInfo
  open?: boolean
}
interface UserPreset {
  name: string
  target: string
  opts: ConvOpts
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
  { label: 'Audio → MP3', from: 'audio', to: 'mp3' },
  { label: 'Image → WebP (léger)', from: 'image', to: 'webp' }
]

export default function App(): JSX.Element {
  const [pending, setPending] = useState<Pending[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [quality, setQuality] = usePersisted<'0' | '1' | '2'>('quality', '1')
  const [outDir, setOutDir] = usePersisted<string | null>('outDir', null)
  const [userPresets, setUserPresets] = usePersisted<UserPreset[]>('userPresets', [])
  const [promptNode, ask] = usePrompt()

  useEffect(() => {
    window.kit.invoke<Job[]>('convert:jobs').then(setJobs)
    return window.kit.on('convert:jobs', (j: Job[]) => setJobs([...j]))
  }, [])

  const add = (paths: string[]): void => {
    const items = paths.map((path) => {
      const kind = INPUT_KIND[extOf(path)]
      return { path, kind, target: kind ? DEFAULT_TARGET[kind] : '', opts: {} as ConvOpts }
    })
    const unknown = items.filter((i) => !i.kind).length
    if (unknown) toast(`${unknown} fichier${unknown > 1 ? 's' : ''} ignoré${unknown > 1 ? 's' : ''} : format inconnu`, 'error')
    const fresh = items.filter((i) => i.kind)
    setPending((p) => [...p, ...fresh.filter((i) => !p.some((x) => x.path === i.path))])
    // Infos (durée, résolution…) lues en arrière-plan.
    for (const f of fresh)
      void window.kit.invoke<MediaInfo>('convert:probe', f.path).then((info) => setPending((all) => all.map((x) => (x.path === f.path ? { ...x, info } : x))))
  }
  const patch = (i: number, p: Partial<Pending>): void => setPending((all) => all.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const setOpt = (i: number, o: Partial<ConvOpts>): void => setPending((all) => all.map((x, j) => (j === i ? { ...x, opts: { ...x.opts, ...o } } : x)))
  const optsToAll = (i: number): void => {
    const src = pending[i]
    setPending((all) => all.map((x) => (x.kind === src.kind ? { ...x, opts: { ...src.opts }, target: src.target } : x)))
    toast('Réglages appliqués à tous les fichiers du même type', 'success')
  }
  const savePreset = async (i: number): Promise<void> => {
    const name = await ask('Nom du préréglage', `${TARGETS.find((t) => t.id === pending[i].target)?.label ?? ''} perso`)
    if (!name) return
    setUserPresets([...userPresets.filter((p) => p.name !== name), { name, target: pending[i].target, opts: pending[i].opts }])
    toast('Préréglage enregistré', 'success')
  }
  const applyPreset = (p: UserPreset): void => {
    const kind = TARGETS.find((t) => t.id === p.target)?.kind
    setPending((all) => all.map((x) => (targetsFor(x.kind).some((t) => t.id === p.target) ? { ...x, target: p.target, opts: { ...p.opts } } : x)))
    if (kind) toast(`Préréglage « ${p.name} » appliqué`, 'info')
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
    await window.kit.invoke('convert:add', pending.map((p) => ({ path: p.path, target: p.target, opts: p.opts })), Number(quality), outDir)
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
              {userPresets.map((p) => (
                <span key={p.name} className="chip preset-chip">
                  <button onClick={() => applyPreset(p)}>
                    <Bookmark size={11} /> {p.name}
                  </button>
                  <button className="x" onClick={() => setUserPresets(userPresets.filter((x) => x.name !== p.name))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            {pending.map((p, i) => {
              const tgt = TARGETS.find((t) => t.id === p.target)
              const isVideoOut = tgt?.kind === 'video'
              const fromVideo = p.kind === 'video'
              return (
                <div key={p.path} className="pending-block">
                  <div className="pending-row">
                    <span className={`kind-icon ${p.kind}`}>{p.kind && KIND_ICON[p.kind]}</span>
                    <span className="pending-name" title={p.path}>
                      {name(p.path)}
                      {p.info && (
                        <span className="info faint">
                          {p.info.duration > 0 && fmtTime(p.info.duration)}
                          {p.info.width && ` · ${p.info.width}×${p.info.height}`}
                          {p.info.fps && ` · ${Math.round(p.info.fps)} i/s`}
                          {p.info.vcodec && ` · ${p.info.vcodec}`}
                          {p.info.acodec && ` · ${p.info.acodec}`}
                        </span>
                      )}
                    </span>
                    <Repeat2 size={14} className="faint" />
                    <select className="select" value={p.target} onChange={(e) => patch(i, { target: e.target.value })}>
                      {targetsFor(p.kind).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button className={`btn btn-sm btn-icon ${p.open || hasOpts(p.opts) ? 'on' : 'btn-ghost'}`} onClick={() => patch(i, { open: !p.open })} title="Retouches : découper, redimensionner, tourner…">
                      <SlidersHorizontal size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPending((all) => all.filter((_, j) => j !== i))}>
                      <X size={14} />
                    </button>
                  </div>
                  {p.open && (
                    <div className="opts">
                      {tgt?.kind !== 'image' && p.kind !== 'image' && (
                        <div className="opt-group">
                          <span className="field-label">Découper</span>
                          <div className="ui-row">
                            <input className="input time-in" placeholder="début 0:00" value={p.opts.start ?? ''} onChange={(e) => setOpt(i, { start: e.target.value })} />
                            <span className="faint">→</span>
                            <input className="input time-in" placeholder={p.info?.duration ? `fin ${fmtTime(p.info.duration)}` : 'fin'} value={p.opts.end ?? ''} onChange={(e) => setOpt(i, { end: e.target.value })} />
                          </div>
                        </div>
                      )}
                      {tgt?.kind === 'image' && fromVideo && (
                        <div className="opt-group">
                          <span className="field-label">Image prise à</span>
                          <input className="input time-in" placeholder="0:05" value={p.opts.frameAt ?? ''} onChange={(e) => setOpt(i, { frameAt: e.target.value })} />
                        </div>
                      )}
                      {tgt?.kind !== 'audio' && (
                        <div className="opt-group">
                          <span className="field-label">Largeur max</span>
                          <select className="select" value={p.opts.width ?? ''} onChange={(e) => setOpt(i, { width: e.target.value ? Number(e.target.value) : undefined })}>
                            <option value="">Taille d’origine</option>
                            {(isVideoOut ? [3840, 2560, 1920, 1280, 854, 640] : [3840, 2560, 1920, 1280, 1024, 800, 512, 256]).map((w) => (
                              <option key={w} value={w}>
                                {isVideoOut ? `${w} px (${{ 3840: '4K', 2560: '1440p', 1920: '1080p', 1280: '720p', 854: '480p', 640: '360p' }[w] ?? ''})` : `${w} px`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {tgt?.kind !== 'audio' && (
                        <div className="opt-group">
                          <span className="field-label">Rotation / miroir</span>
                          <div className="ui-row">
                            <button className="btn btn-ghost btn-sm" onClick={() => setOpt(i, { rotate: (((p.opts.rotate ?? 0) + 90) % 360) as ConvOpts['rotate'] })}>
                              <RotateCw size={13} /> {p.opts.rotate ?? 0}°
                            </button>
                            <select className="select select-sm" value={p.opts.flip ?? ''} onChange={(e) => setOpt(i, { flip: (e.target.value || undefined) as ConvOpts['flip'] })}>
                              <option value="">Sans miroir</option>
                              <option value="h">Miroir horizontal</option>
                              <option value="v">Miroir vertical</option>
                            </select>
                          </div>
                        </div>
                      )}
                      {tgt?.kind !== 'image' && (
                        <div className="opt-group">
                          <span className="field-label">Vitesse</span>
                          <select className="select" value={p.opts.speed ?? 1} onChange={(e) => setOpt(i, { speed: Number(e.target.value) })}>
                            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((v) => (
                              <option key={v} value={v}>
                                ×{String(v).replace('.', ',')}
                                {v === 1 ? ' (normale)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {isVideoOut && p.target !== 'gif' && (
                        <div className="opt-group">
                          <span className="field-label">Taille max du fichier</span>
                          <select className="select" value={p.opts.targetMB ?? ''} onChange={(e) => setOpt(i, { targetMB: e.target.value ? Number(e.target.value) : undefined })}>
                            <option value="">Selon la qualité</option>
                            <option value="8">8 Mo</option>
                            <option value="10">10 Mo (Discord)</option>
                            <option value="16">16 Mo (WhatsApp)</option>
                            <option value="25">25 Mo (e-mail)</option>
                            <option value="50">50 Mo</option>
                            <option value="100">100 Mo</option>
                          </select>
                        </div>
                      )}
                      {isVideoOut && p.target !== 'gif' && (
                        <div className="opt-group">
                          <span className="field-label">Images / seconde</span>
                          <select className="select" value={p.opts.fps ?? ''} onChange={(e) => setOpt(i, { fps: e.target.value ? Number(e.target.value) : undefined })}>
                            <option value="">D’origine</option>
                            {[15, 24, 25, 30, 60].map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {tgt?.kind !== 'image' && (
                        <div className="opt-group">
                          <span className="field-label">Son</span>
                          <div className="ui-row wrap">
                            {isVideoOut && (
                              <label className="ui-row faint">
                                <input type="checkbox" checked={!!p.opts.mute} onChange={(e) => setOpt(i, { mute: e.target.checked })} /> Couper le son
                              </label>
                            )}
                            <label className="ui-row faint">
                              <input type="checkbox" checked={!!p.opts.normalize} onChange={(e) => setOpt(i, { normalize: e.target.checked })} /> Volume normalisé
                            </label>
                            <label className="ui-row faint">
                              Volume
                              <input type="range" min={0} max={300} step={10} value={p.opts.volume ?? 100} onChange={(e) => setOpt(i, { volume: Number(e.target.value) })} />
                              <b>{p.opts.volume ?? 100} %</b>
                            </label>
                          </div>
                        </div>
                      )}
                      <div className="opt-group">
                        <label className="ui-row faint">
                          <input type="checkbox" checked={!!p.opts.stripMeta} onChange={(e) => setOpt(i, { stripMeta: e.target.checked })} /> Retirer les métadonnées (GPS, appareil…)
                        </label>
                      </div>
                      <div className="opt-actions">
                        {pending.filter((x) => x.kind === p.kind).length > 1 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => optsToAll(i)}>
                            Appliquer à tous les fichiers de ce type
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => void savePreset(i)}>
                          <Bookmark size={13} /> Enregistrer comme préréglage
                        </button>
                        {hasOpts(p.opts) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => patch(i, { opts: {} })}>
                            Tout réinitialiser
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
              <div className="ui-row">
                {jobs.some((j) => j.status === 'waiting' || j.status === 'running') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.invoke('convert:cancelAll')}>
                    Tout annuler
                  </button>
                )}
                {outDir && (
                  <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.openPath(outDir)}>
                    <FolderOpen size={13} /> Ouvrir le dossier
                  </button>
                )}
                {finished > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.invoke('convert:clear')}>
                    <Trash2 size={13} /> Effacer la liste
                  </button>
                )}
              </div>
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
                        {hasOpts(j.opts) && <span className="chip tiny-chip">retouché</span>}
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
                    {j.status === 'error' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.invoke('convert:retry', j.id)}>
                        Réessayer
                      </button>
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
      {promptNode}
      <Toasts />
    </Layout>
  )
}
