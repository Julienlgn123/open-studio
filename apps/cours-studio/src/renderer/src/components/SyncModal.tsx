import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, Laptop, Send, TriangleAlert, Wifi, X } from 'lucide-react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface SyncStatus {
  role: 'receive' | 'send'
  phase: 'waiting' | 'transferring' | 'applying' | 'done' | 'error'
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

const muted = { fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.55 } as const

function Progress({ done = 0, total }: { done?: number; total?: number }) {
  const pct = total ? Math.round((done / total) * 100) : null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <span>{total ? `${done} / ${total} fichiers` : `${done} fichiers reçus`}</span>
        {pct !== null && <span>{pct} %</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct ?? 30}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 200ms' }} />
      </div>
    </div>
  )
}

/** Synchro directe entre deux PC du même réseau : l'un envoie tout, l'autre remplace tout. */
export default function SyncModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'choose' | 'send' | 'receive'>('choose')
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [info, setInfo] = useState<ReceiveInfo | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [target, setTarget] = useState<Peer | null>(null)
  const [manual, setManual] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const busy = sending || status?.phase === 'transferring' || status?.phase === 'applying'
  const close = (): void => {
    if (busy) return
    api.sync.stopReceive()
    api.sync.stopDiscovery()
    onClose()
  }
  useEscapeToClose(close)

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

  function back() {
    api.sync.stopReceive()
    api.sync.stopDiscovery()
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

  async function send() {
    const peer = target ?? manualPeer()
    if (!peer || code.trim().length !== 6) return
    setSending(true)
    setError(null)
    try {
      await api.sync.send(peer.host, peer.port, code.trim())
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setSending(false)
    }
  }

  const sendDone = status?.role === 'send' && status.phase === 'done'
  const recvStatus = status?.role === 'receive' ? status : null

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal fade-in" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode !== 'choose' && !busy && !sendDone && (
              <button className="icon-btn" onClick={back} title="Retour">
                <ArrowLeft size={15} />
              </button>
            )}
            Synchroniser deux PC
          </span>
          <button className="icon-btn" onClick={close} disabled={busy}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {mode === 'choose' && (
            <>
              <p style={muted}>
                Copie <strong>tout</strong> Cours Studio (matières, cours, pièces jointes, enregistrements, fiches, réglages)
                d’un PC à l’autre, directement par le Wi-Fi. Les deux PC doivent être sur le même réseau et avoir Cours Studio
                ouvert.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                <button className="sync-choice" onClick={startSend}>
                  <Send size={20} />
                  <strong>Envoyer</strong>
                  <span>Ce PC est la source : ses données partent vers l’autre.</span>
                </button>
                <button className="sync-choice" onClick={startReceive}>
                  <Download size={20} />
                  <strong>Recevoir</strong>
                  <span>Ce PC est remplacé par les données de l’autre.</span>
                </button>
              </div>
              <p style={{ ...muted, marginTop: 14 }}>Commence par « Recevoir » sur le PC à remplacer, puis « Envoyer » sur l’autre.</p>
            </>
          )}

          {mode === 'receive' && (
            <>
              {recvStatus?.phase === 'done' ? (
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
                  <Progress done={recvStatus.done} total={recvStatus.total} />
                </>
              ) : info ? (
                <>
                  <div className="sync-warning">
                    <TriangleAlert size={15} />
                    Toutes les données de ce PC seront remplacées. Elles sont gardées de côté dans le dossier des sauvegardes.
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
                  <div style={{ fontWeight: 600, marginTop: 10 }}>Envoyé à {status?.peer}</div>
                  <p style={muted}>{status?.total} fichiers transférés. L’autre PC redémarre avec tes données.</p>
                </div>
              ) : sending ? (
                <>
                  <div style={{ fontWeight: 600 }}>Envoi vers {status?.peer ?? target?.name ?? manual}…</div>
                  <p style={muted}>Garde les deux PC allumés et sur le Wi-Fi.</p>
                  <Progress done={status?.done} total={status?.total} />
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
                  <p style={{ ...muted, marginTop: 10 }}>Les données de l’autre PC seront remplacées par celles de ce PC.</p>
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

        {mode === 'send' && !sending && !sendDone && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={back}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={send} disabled={code.length !== 6 || (!target && !manualPeer())}>
              <Send size={14} /> Envoyer mes données
            </button>
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
