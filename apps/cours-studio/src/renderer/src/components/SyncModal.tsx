import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronRight, Download, Laptop, Link2, ListChecks, Search, Send, Share2, TriangleAlert, Unlink, Wifi, X } from 'lucide-react'
import { useStore } from '../store'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface SyncStatus {
  role: 'receive' | 'send'
  phase: 'waiting' | 'transferring' | 'applying' | 'done' | 'paired' | 'shared' | 'error'
  done?: number
  total?: number
  message?: string
  peer?: string
}
interface Peer {
  name: string
  host: string
  port: number
}
interface ReceiveInfo {
  code: string
  name: string
  port: number
  addresses: string[]
}

interface ShareSubject {
  id: string
  name: string
  emoji: string
  courses: { id: string; title: string; emoji: string }[]
}

const muted = { fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.55 } as const
const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

/** Case à cocher d'une matière : cochée, vide ou « en partie » (certains de ses cours). */
function TriCheckbox({ checked, partial, onChange }: { checked: boolean; partial: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial
  }, [partial])
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} onClick={(e) => e.stopPropagation()} />
}

/** Choix des matières / cours à partager. */
function SharePicker({
  subjects,
  courses,
  setCourses,
  emptySubjects,
  setEmptySubjects
}: {
  subjects: ShareSubject[]
  courses: Set<string>
  setCourses: (s: Set<string>) => void
  emptySubjects: Set<string>
  setEmptySubjects: (s: Set<string>) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(subjects.filter((s) => s.courses.some((c) => courses.has(c.id)) && !s.courses.every((c) => courses.has(c.id))).map((s) => s.id))
  )
  const q = query.trim().toLowerCase()
  const visible = q
    ? subjects
        .map((s) => (s.name.toLowerCase().includes(q) ? s : { ...s, courses: s.courses.filter((c) => c.title.toLowerCase().includes(q)) }))
        .filter((s) => s.courses.length || s.name.toLowerCase().includes(q))
    : subjects

  const toggleSubject = (s: ShareSubject): void => {
    if (!s.courses.length) {
      const next = new Set(emptySubjects)
      if (next.has(s.id)) next.delete(s.id)
      else next.add(s.id)
      setEmptySubjects(next)
      return
    }
    const all = s.courses.every((c) => courses.has(c.id))
    const next = new Set(courses)
    for (const c of s.courses) {
      if (all) next.delete(c.id)
      else next.add(c.id)
    }
    setCourses(next)
  }
  const toggleCourse = (id: string): void => {
    const next = new Set(courses)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCourses(next)
  }
  const toggleOpen = (id: string): void => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }

  if (!subjects.length) return <p style={muted}>Aucune matière à partager pour l’instant.</p>

  return (
    <>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input className="field-input" style={{ paddingLeft: 30 }} placeholder="Rechercher une matière ou un cours…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={{ maxHeight: '42vh', overflow: 'auto', paddingRight: 2 }}>
        {visible.map((s) => {
          const full = subjects.find((x) => x.id === s.id)!
          const n = full.courses.filter((c) => courses.has(c.id)).length
          const all = full.courses.length ? n === full.courses.length : emptySubjects.has(s.id)
          const expanded = !!q || open.has(s.id)
          return (
            <div key={s.id} style={{ marginBottom: 4 }}>
              <label className="peer-row" style={{ marginBottom: 0 }}>
                <TriCheckbox checked={all} partial={n > 0 && !all} onChange={() => toggleSubject(full)} />
                <span className="peer-row-emoji">{s.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="peer-row-title" style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="peer-row-reason">
                    {full.courses.length ? `${n} / ${full.courses.length} cours` : 'matière vide'}
                  </span>
                </span>
                {full.courses.length > 0 && (
                  <button
                    className="icon-btn"
                    title={expanded ? 'Masquer les cours' : 'Choisir des cours'}
                    onClick={(e) => {
                      e.preventDefault()
                      toggleOpen(s.id)
                    }}
                  >
                    <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
                  </button>
                )}
              </label>
              {expanded &&
                s.courses.map((c) => (
                  <label key={c.id} className="peer-row" style={{ margin: '4px 0 0 26px', padding: '6px 10px' }}>
                    <input type="checkbox" checked={courses.has(c.id)} onChange={() => toggleCourse(c.id)} />
                    <span className="peer-row-emoji" style={{ fontSize: 14 }}>{c.emoji}</span>
                    <span className="peer-row-title" style={{ flex: 1, minWidth: 0 }}>{c.title || 'Sans titre'}</span>
                  </label>
                ))}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Progress({ done = 0, total, unit = 'fichiers' }: { done?: number; total?: number; unit?: string }) {
  const pct = total ? Math.round((done / total) * 100) : null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <span>{total ? `${done} / ${total} ${unit}` : `${done} ${unit} reçus`}</span>
        {pct !== null && <span>{pct} %</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct ?? 30}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 200ms' }} />
      </div>
    </div>
  )
}

/**
 * Synchro directe entre deux PC du même réseau : l'un envoie tout, l'autre remplace tout ;
 * ou partage d'une sélection de cours / matières, ajoutée aux données de l'autre PC.
 * `initialCourseIds` / `initialSubjectIds` : ouvre directement le choix des cours à partager,
 * avec ces cours (ou tous ceux de ces matières) déjà cochés.
 */
export default function SyncModal({
  onClose,
  initialCourseIds,
  initialSubjectIds
}: {
  onClose: () => void
  initialCourseIds?: string[]
  initialSubjectIds?: string[]
}) {
  const preselected = !!(initialCourseIds || initialSubjectIds)
  const [mode, setMode] = useState<'choose' | 'pick' | 'send' | 'receive'>(preselected ? 'pick' : 'choose')
  /** Partage d'une sélection (sinon : envoi de toutes les données). */
  const [sharing, setSharing] = useState(preselected)
  const [shareSubjects, setShareSubjects] = useState<ShareSubject[] | null>(null)
  const [shareCourses, setShareCourses] = useState<Set<string>>(() => new Set(initialCourseIds ?? []))
  const [shareEmpty, setShareEmpty] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [info, setInfo] = useState<ReceiveInfo | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [target, setTarget] = useState<Peer | null>(null)
  const [manual, setManual] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const paired = useStore((s) => s.paired)
  const settings = useStore((s) => s.settings)
  const saveSettings = useStore((s) => s.saveSettings)

  const busy = sending || status?.phase === 'transferring' || status?.phase === 'applying'
  const close = (): void => {
    if (busy) return
    api.sync.stopReceive()
    api.sync.stopDiscovery()
    onClose()
  }
  useEscapeToClose(close)

  useEffect(() => {
    if (mode === 'pick' && !shareSubjects) {
      api.sync
        .shareables()
        .then((list: ShareSubject[]) => {
          if (initialSubjectIds?.length) {
            const chosen = list.filter((s) => initialSubjectIds.includes(s.id))
            setShareCourses((prev) => new Set([...prev, ...chosen.flatMap((s) => s.courses.map((c) => c.id))]))
            setShareEmpty(new Set(chosen.filter((s) => !s.courses.length).map((s) => s.id)))
          }
          setShareSubjects(list)
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, shareSubjects])

  // Matières dont tout est coché : recréées chez l'autre même si elles sont vides.
  const shareSubjectIds = useMemo(
    () =>
      (shareSubjects ?? [])
        .filter((s) => (s.courses.length ? s.courses.every((c) => shareCourses.has(c.id)) : shareEmpty.has(s.id)))
        .map((s) => s.id),
    [shareSubjects, shareCourses, shareEmpty]
  )
  const shareCount = shareCourses.size

  useEffect(() => {
    const offStatus = api.sync.onStatus((s: SyncStatus) => setStatus(s))
    const offPeers = api.sync.onPeers((p: Peer[]) => setPeers(p))
    return () => {
      offStatus()
      offPeers()
      api.sync.stopReceive()
      api.sync.stopDiscovery()
    }
  }, [])

  async function startReceive() {
    setMode('receive')
    setError(null)
    try {
      setInfo(await api.sync.startReceive())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function startSend() {
    setMode('send')
    setError(null)
    api.sync.startDiscovery()
  }

  function startPick() {
    setSharing(true)
    setMode('pick')
    setError(null)
  }

  function back() {
    api.sync.stopReceive()
    api.sync.stopDiscovery()
    // Depuis le choix de l'autre PC en mode partage : on revient à la sélection des cours.
    if (mode === 'send' && sharing) {
      setMode('pick')
      setTarget(null)
      setError(null)
      return
    }
    setSharing(false)
    setMode('choose')
    setStatus(null)
    setInfo(null)
    setTarget(null)
    setError(null)
  }

  const manualPeer = (): Peer | null => {
    const m = manual.trim().match(/^([\w.-]+|\[[\da-f:]+\])(?::(\d+))?$/i)
    return m ? { name: m[1], host: m[1].replace(/^\[|\]$/g, ''), port: Number(m[2] ?? 47810) } : null
  }

  async function send(pairOnly = false) {
    const peer = target ?? manualPeer()
    if (!peer || code.trim().length !== 6) return
    setSending(true)
    setError(null)
    try {
      if (sharing) await api.sync.share(peer.host, peer.port, code.trim(), [...shareCourses], shareSubjectIds)
      else await api.sync.send(peer.host, peer.port, code.trim(), pairOnly)
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setSending(false)
    }
  }

  const sendDone = status?.role === 'send' && (status.phase === 'done' || status.phase === 'paired' || status.phase === 'shared')
  const recvStatus = status?.role === 'receive' ? status : null

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal fade-in" style={{ maxWidth: mode === 'choose' ? 560 : 500, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode !== 'choose' && !busy && !sendDone && (
              <button className="icon-btn" onClick={back} title="Retour">
                <ArrowLeft size={15} />
              </button>
            )}
            {sharing ? 'Partager des cours' : 'Synchroniser deux PC'}
          </span>
          <button className="icon-btn" onClick={close} disabled={busy}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {mode === 'choose' && (
            <>
              <p style={muted}>
                Directement par le Wi-Fi, sans cloud : copie <strong>tout</strong> Cours Studio d’un PC à l’autre, ou partage
                seulement les matières / cours que tu choisis. Les deux PC doivent être sur le même réseau et avoir Cours Studio
                ouvert.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
                <button className="sync-choice" onClick={startSend}>
                  <Send size={20} />
                  <strong>Tout envoyer</strong>
                  <span>Ce PC est la source : toutes ses données remplacent celles de l’autre.</span>
                </button>
                <button className="sync-choice" onClick={startPick}>
                  <Share2 size={20} />
                  <strong>Partager des cours</strong>
                  <span>Choisis des matières ou des cours : ils s’ajoutent à ceux de l’autre PC.</span>
                </button>
                <button className="sync-choice" onClick={startReceive}>
                  <Download size={20} />
                  <strong>Recevoir</strong>
                  <span>Ce PC attend un envoi complet ou un partage de cours.</span>
                </button>
              </div>
              <p style={{ ...muted, marginTop: 14 }}>
                Commence par « Recevoir » sur l’autre PC, puis « Tout envoyer » ou « Partager des cours » sur celui-ci.
              </p>
              {paired.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>PC associés</div>
                  <p style={{ ...muted, marginBottom: 8 }}>
                    Quand les deux sont ouverts sur le même réseau, ils se retrouvent : bouton en haut de la fenêtre pour les
                    resynchroniser, clic droit sur un cours pour l’envoyer.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '4px 0 10px', fontSize: 12.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!settings.autoPeerSync}
                      onChange={(e) => saveSettings({ ...settings, autoPeerSync: e.target.checked })}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>Synchro automatique</strong>
                      <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 12 }}>
                        Dès que les deux PC sont ouverts, ils se mettent à jour tout seuls (vérifié chaque minute). Les versions
                        remplacées restent dans l’historique des cours.
                      </span>
                    </span>
                  </label>
                  {paired.map((p) => (
                    <div key={p.id} className="sync-peer" style={{ cursor: 'default', marginBottom: 6 }}>
                      <Laptop size={16} />
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span style={{ fontSize: 11.5, color: p.online ? 'var(--success)' : 'var(--text-tertiary)' }}>
                        {p.online ? 'connecté' : 'hors ligne'}
                      </span>
                      <button className="icon-btn" title="Dissocier" onClick={() => api.peers.unpair(p.id)}>
                        <Unlink size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === 'pick' && (
            <>
              <p style={{ ...muted, marginBottom: 12 }}>
                Coche une matière entière ou ouvre-la pour choisir ses cours. Ils sont envoyés avec leurs pièces jointes,
                enregistrements, fiches et historique ; rien d’autre n’est touché sur l’autre PC.
              </p>
              {shareSubjects ? (
                <SharePicker
                  subjects={shareSubjects}
                  courses={shareCourses}
                  setCourses={setShareCourses}
                  emptySubjects={shareEmpty}
                  setEmptySubjects={setShareEmpty}
                />
              ) : (
                !error && <div className="spinner" style={{ margin: '24px auto' }} />
              )}
            </>
          )}

          {mode === 'receive' && (
            <>
              {recvStatus?.phase === 'shared' ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
                  <div style={{ fontWeight: 600, marginTop: 10 }}>
                    {plural(recvStatus.done ?? 0, 'cours')} reçu{(recvStatus.done ?? 0) > 1 ? 's' : ''} de {recvStatus.peer}
                  </div>
                  <p style={muted}>
                    Ils sont rangés dans leurs matières. Si tu avais déjà un de ces cours, ta version reste dans son historique.
                  </p>
                </div>
              ) : recvStatus?.phase === 'paired' ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
                  <div style={{ fontWeight: 600, marginTop: 10 }}>Associé à {recvStatus.peer}</div>
                  <p style={muted}>Aucune donnée n’a été remplacée. Les deux PC se retrouveront tout seuls sur ce réseau.</p>
                </div>
              ) : recvStatus?.phase === 'done' ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
                  <div style={{ fontWeight: 600, marginTop: 10 }}>Données reçues de {recvStatus.peer}</div>
                  <p style={muted}>Cours Studio redémarre avec les nouvelles données…</p>
                </div>
              ) : recvStatus && recvStatus.phase !== 'waiting' && recvStatus.phase !== 'error' ? (
                <>
                  <div style={{ fontWeight: 600 }}>
                    {recvStatus.phase === 'applying' ? 'Installation des données…' : `Réception depuis ${recvStatus.peer}…`}
                  </div>
                  <p style={muted}>Ne ferme pas Cours Studio.</p>
                  <Progress done={recvStatus.done} total={recvStatus.total} unit={recvStatus.total || recvStatus.done ? 'cours' : 'fichiers'} />
                </>
              ) : info ? (
                <>
                  <div className="sync-warning">
                    <TriangleAlert size={15} />
                    <span>
                      Si l’autre PC fait « Tout envoyer », toutes les données de ce PC sont remplacées (gardées de côté dans le
                      dossier des sauvegardes). S’il partage des cours, ils s’ajoutent simplement aux tiens.
                    </span>
                  </div>
                  <div style={{ textAlign: 'center', margin: '18px 0 6px' }}>
                    <div style={muted}>Code à taper sur l’autre PC</div>
                    <div className="sync-code">{info.code.slice(0, 3)} {info.code.slice(3)}</div>
                    <div style={{ ...muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Wifi size={13} className="sync-pulse" /> « {info.name} » attend l’envoi…
                    </div>
                  </div>
                  {info.addresses.length > 0 && (
                    <p style={{ ...muted, fontSize: 11.5, textAlign: 'center', marginTop: 10 }}>
                      Si l’autre PC ne le trouve pas : adresse {info.addresses.map((a) => `${a}:${info.port}`).join(' ou ')}
                    </p>
                  )}
                </>
              ) : (
                !error && <div className="spinner" style={{ margin: '24px auto' }} />
              )}
            </>
          )}

          {mode === 'send' && (
            <>
              {sendDone ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
                  <div style={{ fontWeight: 600, marginTop: 10 }}>
                    {status?.phase === 'paired' ? `Associé à ${status?.peer}` : status?.phase === 'shared' ? `Partagé avec ${status?.peer}` : `Envoyé à ${status?.peer}`}
                  </div>
                  <p style={muted}>
                    {status?.phase === 'paired'
                      ? 'Les deux PC se retrouveront tout seuls quand Cours Studio sera ouvert dessus.'
                      : status?.phase === 'shared'
                        ? `${plural(status?.done ?? 0, 'cours')} ajouté${(status?.done ?? 0) > 1 ? 's' : ''} sur ${status?.peer}. Ses autres cours n’ont pas été touchés.`
                        : `${status?.total} fichiers transférés. L’autre PC redémarre avec tes données. Les deux PC restent associés.`}
                  </p>
                </div>
              ) : sending ? (
                <>
                  <div style={{ fontWeight: 600 }}>Envoi vers {status?.peer ?? target?.name ?? manual}…</div>
                  <p style={muted}>Garde les deux PC allumés et sur le Wi-Fi.</p>
                  <Progress done={status?.done} total={status?.total} unit={sharing ? 'cours' : 'fichiers'} />
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>PC en attente sur ton réseau</div>
                  {peers.length === 0 ? (
                    <div className="sync-searching">
                      <div className="spinner" style={{ width: 14, height: 14 }} />
                      Recherche… lance « Recevoir » sur l’autre PC.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {peers.map((p) => {
                        const on = target?.host === p.host && target.port === p.port
                        return (
                          <button key={`${p.host}:${p.port}`} className={`sync-peer${on ? ' on' : ''}`} onClick={() => setTarget(p)}>
                            <Laptop size={16} />
                            <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{p.host}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {!target && (
                    <input
                      className="field-input"
                      style={{ marginTop: 10 }}
                      placeholder="…ou son adresse (ex. 192.168.1.20:47810)"
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                    />
                  )}
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '16px 0 8px' }}>Code affiché sur l’autre PC</div>
                  <input
                    className="field-input sync-code-input"
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="123 456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                  />
                  <p style={{ ...muted, marginTop: 10 }}>
                    {sharing
                      ? `${plural(shareCount, 'cours')} ${shareCount > 1 ? 'seront ajoutés' : 'sera ajouté'} à ceux de l’autre PC, sans rien remplacer d’autre.`
                      : '« Envoyer » remplace les données de l’autre PC par celles de ce PC. « Associer seulement » ne touche à rien : vous pourrez ensuite synchroniser cours par cours.'}
                  </p>
                </>
              )}
            </>
          )}

          {error && (
            <div className="sync-warning" style={{ marginTop: 14, color: 'var(--danger)', background: 'var(--danger-dim)' }}>
              <TriangleAlert size={15} />
              {error}
            </div>
          )}
        </div>

        {mode === 'pick' && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={preselected ? close : back}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={startSend} disabled={shareCount === 0 && shareSubjectIds.length === 0}>
              <ListChecks size={14} /> Continuer ({plural(shareCount, 'cours')})
            </button>
          </div>
        )}
        {mode === 'send' && !sending && !sendDone && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={back}>
              {sharing ? 'Retour' : 'Annuler'}
            </button>
            {sharing ? (
              <button className="btn btn-primary" onClick={() => send()} disabled={code.length !== 6 || (!target && !manualPeer())}>
                <Share2 size={14} /> Partager {plural(shareCount, 'cours')}
              </button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => send(true)} disabled={code.length !== 6 || (!target && !manualPeer())}>
                  <Link2 size={14} /> Associer seulement
                </button>
                <button className="btn btn-primary" onClick={() => send()} disabled={code.length !== 6 || (!target && !manualPeer())}>
                  <Send size={14} /> Envoyer mes données
                </button>
              </>
            )}
          </div>
        )}
        {sendDone && (
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={close}>
              Terminé
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
