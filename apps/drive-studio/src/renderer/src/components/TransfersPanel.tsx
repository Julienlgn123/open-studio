import { X, Upload, Download, Copy, CheckCircle, XCircle } from 'lucide-react'
import { useStore } from '../store'
import { formatBytes, formatSpeed, etaFrom } from '../lib/format'
import ProgressBar from './ProgressBar'

export default function TransfersPanel(): JSX.Element | null {
  const { transfers, clearFinishedTransfers } = useStore()
  if (transfers.length === 0) return null

  const active = transfers.filter((t) => t.status === 'active').length

  return (
    <div className="transfers">
      <div className="transfers-head">
        <span>Transferts {active > 0 && `· ${active} en cours`}</span>
        <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={clearFinishedTransfers}>
          <X size={13} />
        </button>
      </div>
      {transfers.map((t) => {
        const ratio = t.bytesTotal > 0 ? t.bytesDone / t.bytesTotal : 0
        const Icon = t.kind === 'upload' ? Upload : t.kind === 'download' ? Download : Copy
        return (
          <div className="transfer-row" key={t.id}>
            <div className="transfer-name">
              {t.status === 'done' ? (
                <CheckCircle size={13} style={{ color: 'var(--success)' }} />
              ) : t.status === 'error' ? (
                <XCircle size={13} style={{ color: 'var(--danger)' }} />
              ) : (
                <Icon size={13} style={{ color: 'var(--accent-light)' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.filename}
              </span>
            </div>
            {t.status === 'active' && <ProgressBar ratio={ratio} variant="accent" height={4} />}
            <div className="transfer-meta">
              {t.status === 'error' ? (
                <span style={{ color: 'var(--danger)' }}>{t.error}</span>
              ) : t.status === 'done' ? (
                <span>Terminé · {formatBytes(t.bytesTotal)}</span>
              ) : (
                <>
                  <span>
                    {formatBytes(t.bytesDone)} / {formatBytes(t.bytesTotal)}
                  </span>
                  <span>
                    {formatSpeed(t.speed)} · {etaFrom(t.bytesDone, t.bytesTotal, t.speed)}
                  </span>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
