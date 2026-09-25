import { RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { formatRelative } from '../lib/format'

export default function TitleBar(): JSX.Element {
  const { syncing, lastSyncAt, accounts, syncQuotas } = useStore()

  return (
    <div className="titlebar">
      <div className="titlebar-controls">
        <div className="titlebar-btn close" onClick={() => window.api.window.close()} />
        <div className="titlebar-btn minimize" onClick={() => window.api.window.minimize()} />
        <div className="titlebar-btn maximize" onClick={() => window.api.window.maximize()} />
      </div>

      <span className="titlebar-title">Drive Studio</span>

      <div className="titlebar-actions">
        {accounts.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            {syncing ? 'Synchronisation…' : `sync auto · ${formatRelative(lastSyncAt)}`}
          </span>
        )}
        <button
          className="icon-btn"
          onClick={() => syncQuotas()}
          disabled={syncing || accounts.length === 0}
          data-tooltip="Forcer la synchronisation"
          data-tooltip-dir="left-down"
        >
          <RefreshCw size={15} style={syncing ? { animation: 'spin 0.7s linear infinite' } : undefined} />
        </button>
      </div>
    </div>
  )
}
