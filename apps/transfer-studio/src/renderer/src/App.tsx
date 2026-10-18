import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Download, FolderOpen, Power, Send, Shield, Smartphone, Trash2, Upload, Wifi, X } from 'lucide-react'
import { Layout, Page, Progress, Toasts, formatBytes, relativeTime, toast, useFileDrop } from '@ui'
import type { TransferState } from '../../shared/types'
import './transfer.css'

export default function App(): JSX.Element {
  const [s, setS] = useState<TransferState | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    window.kit.invoke<TransferState>('transfer:state').then(setS)
    return window.kit.on('transfer:state', setS)
  }, [])
  useEffect(() => {
    if (s?.url) void QRCode.toDataURL(s.url, { margin: 1, width: 260, color: { dark: '#0b1220', light: '#ffffff' } }).then(setQr)
    else setQr(null)
  }, [s?.url])

  const share = (paths: string[]): void => void window.kit.invoke<TransferState>('transfer:share', paths).then(setS)
  const drop = useFileDrop(share)

  if (!s) return <Layout>{null}</Layout>
  return (
    <Layout>
      <Page title="Transfert local" sub="Envoie des fichiers entre ce PC et ton téléphone (ou un autre PC), sur ton Wi-Fi, sans câble ni compte.">
        <div className="transfer">
          <section className="ui-card connect">
            {s.running ? (
              <>
                <div className="qr">{qr ? <img src={qr} alt="QR code" /> : <span className="spinner" />}</div>
                <div className="connect-text">
                  <div className="chip success">
                    <Wifi size={12} /> Partage ouvert
                  </div>
                  <h2>Scanne ce code avec ton téléphone</h2>
                  <ol>
                    <li>Ouvre l’appareil photo (ou Google Lens) et vise le code.</li>
                    <li>Touche le lien qui apparaît : la page de transfert s’ouvre.</li>
                    <li>Envoie tes photos et fichiers, ou télécharge ceux partagés ici.</li>
                  </ol>
                  <p className="faint">Ton téléphone doit être sur le même Wi-Fi que ce PC.</p>
                  <div className="ui-row url-row">
                    <code>{s.url}</code>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Copier le lien" onClick={() => void window.kit.clipboard.write(s.url!).then(() => toast('Lien copié', 'success'))}>
                      <Copy size={14} />
                    </button>
                  </div>
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
                <p className="faint small">
                  <Shield size={12} /> Si Windows demande l’autorisation du pare-feu, accepte pour les réseaux privés.
                </p>
              </div>
            )}
          </section>

          <section className="ui-card">
            <div className="card-head">
              <b>
                <Send size={15} /> Fichiers partagés vers le téléphone
              </b>
              <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.files.open({ multi: true, title: 'Fichiers à partager' }).then(share)}>
                Ajouter
              </button>
            </div>
            <div className={`ui-dropzone small${drop.over ? ' over' : ''}`} {...drop.bind}>
              <Upload size={18} /> Glisse des fichiers ici
            </div>
            {s.shared.map((f) => (
              <div key={f.id} className="file">
                <span className="file-name">{f.name}</span>
                <span className="faint">{formatBytes(f.size)}</span>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void window.kit.invoke<TransferState>('transfer:unshare', f.id).then(setS)}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </section>

          <section className="ui-card received">
            <div className="card-head">
              <b>
                <Download size={15} /> Reçus sur ce PC
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
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.files.openPath(r.path)}>
                  Ouvrir
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.reveal(r.path)}>
                  Afficher
                </button>
              </div>
            ))}
            {!s.received.length && !s.uploads.length && <p className="faint">Les fichiers envoyés depuis ton téléphone arrivent ici.</p>}
          </section>
        </div>
      </Page>
      <Toasts />
    </Layout>
  )
}
