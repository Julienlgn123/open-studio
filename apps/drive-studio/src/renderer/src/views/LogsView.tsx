import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { formatDate } from '../lib/format'
import type { LogAction, LogStatus, SyncLog } from '@shared/types'

const ACTIONS: LogAction[] = [
  'upload',
  'download',
  'replicate',
  'delete',
  'share',
  'unshare',
  'account_add',
  'account_remove',
  'backup'
]

export default function LogsView(): JSX.Element {
  const { accounts, toast } = useStore()
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [action, setAction] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')

  function refresh(): void {
    window.api.logs
      .list({
        action: (action || undefined) as LogAction | undefined,
        status: (status || undefined) as LogStatus | undefined,
        accountId: accountId || undefined,
        limit: 500
      })
      .then(setLogs)
  }

  useEffect(refresh, [action, status, accountId])

  async function clearOld(): Promise<void> {
    const n = await window.api.logs.clearOlderThan(30)
    toast(`${n} entrée(s) de plus de 30 jours supprimée(s)`, 'success')
    refresh()
  }

  return (
    <div className="view-scroll">
      <div className="page-header">
        <span className="page-header-title">Logs</span>
        <div className="page-header-right">
          <button className="btn btn-sm btn-secondary" onClick={clearOld}>
            <Trash2 size={13} /> Purger &gt; 30 j
          </button>
        </div>
      </div>

      <div className="view-pad col" style={{ gap: 14 }}>
        <div className="wrap">
          <select className="field-input" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Toutes les actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className="field-input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="success">Succès</option>
            <option value="failed">Échec</option>
          </select>
          <select
            className="field-input"
            style={{ width: 'auto' }}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Tous les comptes</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </div>

        {logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <div className="empty-state-title">Aucun log</div>
          </div>
        ) : (
          <div className="table-wrap">
            {logs.map((l) => (
              <div className="log-line" key={l.id}>
                <span className="log-time">{formatDate(l.timestamp)}</span>
                <span
                  className="badge"
                  style={{
                    background: l.status === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)',
                    color: l.status === 'success' ? 'var(--success)' : 'var(--danger)',
                    justifySelf: 'start'
                  }}
                >
                  {l.action}
                </span>
                <span className="log-msg" title={l.errorDetails || l.label || ''}>
                  {l.label || l.action}
                  {l.errorDetails ? ` — ${l.errorDetails}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
