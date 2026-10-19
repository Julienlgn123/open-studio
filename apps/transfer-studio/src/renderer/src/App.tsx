import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  ClipboardPaste,
  Copy,
  Download,
  FolderOpen,
  FolderUp,
  KeyRound,
  Laptop,
  MessageSquareText,
  Power,
  Send,
  Settings2,
  Shield,
  Smartphone,
  Timer,
  Trash2,
  Upload,
  Wifi,
  X
} from 'lucide-react'
import { Layout, Modal, Page, Progress, Switch, Toasts, formatBytes, relativeTime, toast, useFileDrop } from '@ui'
import type { TransferSettings, TransferState } from '../../shared/types'
import './transfer.css'

export default function App(): JSX.Element {
  const [s, setS] = useState<TransferState | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [delFor, setDelFor] = useState<string | null>(null)
  const [, tick] = useState(0)
  useEffect(() => {
    window.kit.invoke<TransferState>('transfer:state').then(setS)
    return window.kit.on('transfer:state', setS)
  }, [])
  useEffect(() => {
    if (s?.url) void QRCode.toDataURL(s.url, { margin: 1, width: 260, color: { dark: '#0b1220', light: '#ffffff' } }).then(setQr)
    else setQr(null)
  }, [s?.url])
  // Compte à rebours de fermeture automatique.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(t)
  }, [])

  const share = (paths: string[]): void => void window.kit.invoke<TransferState>('transfer:share', paths).then(setS)
  const drop = useFileDrop(share)
  const setSettings = (p: Partial<TransferSettings>): void => void window.kit.invoke<TransferState>('transfer:settings', p).then(setS)
  const sendText = async (t: string): Promise<void> => {
    if (!t.trim()) return
    setS(await window.kit.invoke<TransferState>('transfer:sendText', t))
    setText('')
    toast('Envoyé : visible sur le téléphone, onglet Texte', 'success')
  }

  if (!s) return <Layout>{null}</Layout>
  const minutesLeft = s.stopsAt ? Math.max(0, Math.round((s.stopsAt - Date.now()) / 60_000)) : null
  const recentDevices = s.devices.filter((d) => Date.now() - d.last < 60_000)
  return (
    <Layout>
      <Page
        title="Transfert local"
        sub="Envoie des fichiers et du texte entre ce PC et ton téléphone (ou un autre PC), sur ton Wi-Fi, sans câble ni compte."
        tools={
          <button className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={14} /> Réglages
          </button>
        }
      >
        <div className="transfer">
          <section className="ui-card connect">
            {s.running ? (
              <>
                <div className="qr">{qr ? <img src={qr} alt="QR code" /> : <span className="spinner" />}</div>
                <div className="connect-text">
                  <div className="ui-row wrap">
                    <div className="chip success">
                      <Wifi size={12} /> Partage ouvert
                    </div>
                    {minutesLeft !== null && (
                      <div className="chip" title="Fermeture automatique sans activité (modifiable dans les réglages)">
                        <Timer size={12} /> se ferme dans {minutesLeft} min sans activité
                      </div>
                    )}
                  </div>
                  <h2>Scanne ce code avec ton téléphone</h2>
                  <ol>
                    <li>Ouvre l’appareil photo (ou Google Lens) et vise le code.</li>
                    <li>Touche le lien qui apparaît : la page de transfert s’ouvre.</li>
                    <li>Envoie tes photos et fichiers, télécharge ceux partagés ici, échange du texte.</li>
                  </ol>
                  {s.pin && (
                    <div className="pin-box">
                      <KeyRound size={16} /> Code à taper sur le téléphone : <b className="pin">{s.pin}</b>
                    </div>
                  )}
                  <p className="faint">Ton téléphone doit être sur le même Wi-Fi que ce PC.</p>
                  {s.addresses.length > 1 && (
                    <label className="ui-row faint addr">
                      Réseau
                      <select className="select select-sm" value={s.settings.address ?? s.addresses[0]} onChange={(e) => setSettings({ address: e.target.value })}>
                        {s.addresses.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                      <span className="small">si le téléphone n’arrive pas à se connecter, essaie une autre adresse</span>
                    </label>
                  )}
                  <div className="ui-row url-row">
                    <code>{s.url}</code>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Copier le lien" onClick={() => void window.kit.clipboard.write(s.url!).then(() => toast('Lien copié', 'success'))}>
                      <Copy size={14} />
                    </button>
                  </div>
                  {s.devices.length > 0 && (
                    <div className="devices">
                      {s.devices.map((d) => (
                        <span key={d.ip} className={`chip${recentDevices.includes(d) ? ' success' : ''}`} title={`${d.ip} · vu ${relativeTime(d.last)}`}>
                          {/PC|Mac/.test(d.name) ? <Laptop size={12} /> : <Smartphone size={12} />} {d.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-secondary" onClick={() => void window.kit.invoke<TransferState>('transfer:stop').then(setS)}>
                    <Power size={14} /> Fermer le partage
                  </button>
                </div>
              </>
            ) : (
              <div className="off">
                <div className="off-icon">
                  <Smartphone size={30} />
                </div>
                <h2>Prêt à transférer</h2>
                <p className="muted">Le partage n’est ouvert que quand tu le décides, et seulement pour qui scanne le code (il contient une clé secrète, renouvelée à chaque fois).</p>
                {!s.addresses.length && <div className="callout warn">Aucun réseau détecté : connecte ce PC au Wi-Fi ou à un câble réseau.</div>}
                <button
                  className="btn btn-primary"
                  disabled={!s.addresses.length}
                  onClick={() =>
                    void window.kit
                      .invoke<TransferState>('transfer:start')
                      .then(setS)
                      .catch((e) => toast(String(e), 'error'))
                  }
                >
                  <Wifi size={15} /> Ouvrir le partage
                </button>
                <label className="ui-row faint pin-toggle">
                  <Switch on={s.settings.pin} onChange={(v) => setSettings({ pin: v })} /> Demander aussi un code à 4 chiffres
                </label>
                <p className="faint small">
                  <Shield size={12} /> Si Windows demande l’autorisation du pare-feu, accepte pour les réseaux privés.
                </p>
              </div>
            )}
          </section>

          <section className="ui-card">
            <div className="card-head">
              <b>
                <Send size={15} /> Partagés vers le téléphone
              </b>
              <div className="ui-row">
                <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.files.open({ multi: true, title: 'Fichiers à partager' }).then(share)}>
                  Fichiers
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.open({ directory: true, title: 'Dossier à partager (envoyé en ZIP)' }).then(share)} title="Le téléphone le reçoit en un seul ZIP">
                  <FolderUp size={13} /> Dossier
                </button>
                {s.shared.length > 1 && (
                  <button className="btn btn-ghost btn-sm btn-icon" title="Tout retirer" onClick={() => void window.kit.invoke<TransferState>('transfer:unshareAll').then(setS)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <div className={`ui-dropzone small${drop.over ? ' over' : ''}`} {...drop.bind}>
              <Upload size={18} /> Glisse des fichiers ou des dossiers ici
            </div>
            {s.shared.map((f) => (
              <div key={f.id} className="file">
                <span className="file-name">
                  {f.dir ? '🗂️ ' : ''}
                  {f.name}
                </span>
                <span className="faint">
                  {formatBytes(f.size)}
                  {f.dir ? ` · ${f.files} fichiers` : ''}
                </span>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void window.kit.invoke<TransferState>('transfer:unshare', f.id).then(setS)}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </section>

          <section className="ui-card texts">
            <div className="card-head">
              <b>
                <MessageSquareText size={15} /> Texte et liens
              </b>
              {s.texts.length > 0 && (
                <button className="btn btn-ghost btn-sm btn-icon" title="Effacer l’historique" onClick={() => void window.kit.invoke<TransferState>('transfer:clearTexts').then(setS)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="text-send">
              <textarea
                className="textarea"
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Un lien, une adresse, un mot de passe Wi-Fi… (Ctrl+Entrée pour envoyer)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendText(text)
                }}
              />
              <div className="ui-col">
                <button className="btn btn-primary btn-sm" onClick={() => void sendText(text)} disabled={!text.trim()}>
                  <Send size={13} /> Envoyer
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.clipboard.read().then((t) => void sendText(t))} title="Envoie directement ce que tu as copié sur le PC">
                  <ClipboardPaste size={13} /> Mon presse-papiers
                </button>
              </div>
            </div>
            <div className="text-list">
              {s.texts.slice(0, 20).map((t) => (
                <div key={t.id} className={`msg ${t.from}`}>
                  <div className="msg-head faint">
                    {t.from === 'pc' ? (
                      <>
                        <Laptop size={11} /> Ce PC
                      </>
                    ) : (
                      <>
                        <Smartphone size={11} /> {t.device ?? 'Téléphone'}
                      </>
                    )}{' '}
                    · {relativeTime(t.at)}
                    <span className="spacer" />
                    {/^https?:\/\/\S+$/.test(t.text) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.openExternal(t.text)}>
                        Ouvrir
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm btn-icon" title="Copier" onClick={() => void window.kit.clipboard.write(t.text).then(() => toast('Copié', 'success'))}>
                      <Copy size={12} />
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Supprimer" onClick={() => void window.kit.invoke<TransferState>('transfer:deleteText', t.id).then(setS)}>
                      <X size={12} />
                    </button>
                  </div>
                  <div className="msg-body">{t.text}</div>
                </div>
              ))}
              {!s.texts.length && <p className="faint">Ce que tu envoies d’ici apparaît sur le téléphone (onglet Texte), et inversement.</p>}
            </div>
          </section>

          <section className="ui-card received">
            <div className="card-head">
              <b>
                <Download size={15} /> Reçus sur ce PC {s.received.length > 0 && <span className="faint">({s.received.length})</span>}
              </b>
              <div className="ui-row">
                <button className="btn btn-ghost btn-sm" title={s.saveDir} onClick={() => void window.kit.files.openPath(s.saveDir)}>
                  <FolderOpen size={13} /> Ouvrir le dossier
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void window.kit.files.open({ directory: true, title: 'Où enregistrer les fichiers reçus' }).then((d) => { if (d[0]) void window.kit.invoke<TransferState>('transfer:setDir', d[0]).then(setS) })}
                >
                  Changer
                </button>
                {s.received.length > 0 && (
                  <button className="btn btn-ghost btn-sm btn-icon" title="Vider la liste (les fichiers restent)" onClick={() => void window.kit.invoke<TransferState>('transfer:clearReceived').then(setS)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            {s.uploads.map((u) => (
              <div key={u.id} className="file uploading">
                <span className="file-name">{u.name}</span>
                <div style={{ width: 140 }}>
                  <Progress ratio={u.total ? u.done / u.total : 0} />
                </div>
                <span className="faint">{u.total ? Math.round((u.done / u.total) * 100) : 0} %</span>
              </div>
            ))}
            {s.received.map((r) => (
              <div key={r.id} className="file">
                <span className="file-name">{r.name}</span>
                <span className="faint">
                  {formatBytes(r.size)} · {relativeTime(r.at)}
                  {r.from && !/^\d/.test(r.from) ? ` · ${r.from}` : ''}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.files.openPath(r.path)}>
                  Ouvrir
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.reveal(r.path)}>
                  Afficher
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Supprimer" onClick={() => setDelFor(r.id)}>
                  <X size={13} />
                </button>
              </div>
            ))}
            {!s.received.length && !s.uploads.length && <p className="faint">Les fichiers envoyés depuis ton téléphone arrivent ici.</p>}
          </section>
        </div>
      </Page>
      {settingsOpen && (
        <Modal title="Réglages du transfert" onClose={() => setSettingsOpen(false)}>
          <div className="ui-col settings">
            <label className="ui-row">
              <Switch on={s.settings.pin} onChange={(v) => setSettings({ pin: v })} />
              <span>
                <b>Code PIN</b>
                <br />
                <span className="faint">En plus du QR code, le téléphone doit taper un code à 4 chiffres affiché ici.</span>
              </span>
            </label>
            <label className="ui-row">
              <Switch on={s.settings.autoCopy} onChange={(v) => setSettings({ autoCopy: v })} />
              <span>
                <b>Copier automatiquement</b>
                <br />
                <span className="faint">Un texte envoyé depuis le téléphone part directement dans le presse-papiers du PC.</span>
              </span>
            </label>
            <label className="field">
              <span className="field-label">Fermer le partage après</span>
              <select className="select" value={s.settings.autoStop} onChange={(e) => setSettings({ autoStop: Number(e.target.value) })}>
                <option value={10}>10 minutes sans activité</option>
                <option value={30}>30 minutes sans activité</option>
                <option value={60}>1 heure sans activité</option>
                <option value={0}>Jamais (je le ferme moi-même)</option>
              </select>
            </label>
          </div>
        </Modal>
      )}
      {delFor && (
        <Modal
          title="Retirer ce fichier ?"
          onClose={() => setDelFor(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => void window.kit.invoke<TransferState>('transfer:deleteReceived', delFor, false).then((x) => (setS(x), setDelFor(null)))}>
                Seulement de la liste
              </button>
              <button className="btn btn-danger" onClick={() => void window.kit.invoke<TransferState>('transfer:deleteReceived', delFor, true).then((x) => (setS(x), setDelFor(null)))}>
                Supprimer le fichier
              </button>
            </>
          }
        >
          <p className="muted">Le fichier peut rester sur le disque, ou être supprimé définitivement.</p>
        </Modal>
      )}
      <Toasts />
    </Layout>
  )
}
