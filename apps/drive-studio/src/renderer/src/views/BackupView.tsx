import { useEffect, useMemo, useState } from 'react'
import { Play, Clock, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { useStore } from '../store'
import ProgressBar from '../components/ProgressBar'
import ScheduleModal from '../components/ScheduleModal'
import { formatBytes, formatRelative, formatDuration, formatDate } from '../lib/format'
import type { BackupMode, BackupProgress, BackupSchedule } from '@shared/types'

export default function BackupView(): JSX.Element {
  const { accounts, jobs, loadJobs, loadAll, toast } = useStore()
  const primaries = useMemo(() => accounts.filter((a) => a.role === 'primary'), [accounts])
  const backups = useMemo(() => accounts.filter((a) => a.role === 'backup'), [accounts])

  const [sources, setSources] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<BackupMode>('incremental')
  const [verify, setVerify] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)

  const [schedules, setSchedules] = useState<BackupSchedule[]>([])
  const [showSched, setShowSched] = useState(false)
  const [editSched, setEditSched] = useState<BackupSchedule | null>(null)

  useEffect(() => {
    loadJobs()
    refreshSchedules()
    const off = window.api.backup.onProgress((p) => setProgress(p))
    return off
  }, [])

  function refreshSchedules(): void {
    window.api.schedules.list().then(setSchedules)
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string): void {
    const n = new Set(set)
    n.has(id) ? n.delete(id) : n.add(id)
    setter(n)
  }

  async function run(): Promise<void> {
    if (sources.size === 0 || targets.size === 0) {
      toast('Sélectionne au moins un compte source et un compte cible', 'error')
      return
    }
    setRunning(true)
    setProgress(null)
    try {
      const report = await window.api.backup.start({
        sourceAccountIds: [...sources],
        targetAccountIds: [...targets],
        mode,
        verify
      })
      await Promise.all([loadJobs(), loadAll()])
      toast(
        `Backup terminé : ${report.copied} copié(s) en ${formatDuration(report.durationMs)}` +
          (report.failed ? ` · ${report.failed} échec(s)` : ''),
        report.failed ? 'error' : 'success'
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec du backup', 'error')
    } finally {
      setRunning(false)
    }
  }

  async function deleteSchedule(id: string): Promise<void> {
    await window.api.schedules.delete(id)
    refreshSchedules()
  }

  async function toggleSchedule(s: BackupSchedule): Promise<void> {
    await window.api.schedules.update(s.id, { enabled: !s.enabled })
    refreshSchedules()
  }

  const accEmail = (id: string): string => accounts.find((a) => a.id === id)?.email ?? id

  return (
    <div className="view-scroll">
      <div className="page-header">
        <span className="page-header-title">Backup & redondance</span>
      </div>

      <div className="view-pad col" style={{ gap: 24 }}>
        {/* Runner */}
        <div className="card col" style={{ gap: 16 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Lancer un backup manuel
          </span>

          {accounts.length < 2 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Il faut au moins deux comptes (un principal, un backup) pour lancer une réplication.
            </p>
          ) : (
            <>
              <div className="pick-grid">
                <div className="pick-col">
                  <span className="field-label">Source (principaux)</span>
                  {primaries.map((a) => (
                    <button
                      key={a.id}
                      className={`pick-item ${sources.has(a.id) ? 'on' : ''}`}
                      onClick={() => toggle(sources, setSources, a.id)}
                    >
                      <input type="checkbox" className="checkbox" readOnly checked={sources.has(a.id)} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</span>
                    </button>
                  ))}
                  {primaries.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Aucun compte principal.</span>}
                </div>
                <div className="pick-col">
                  <span className="field-label">Cible (backup)</span>
                  {backups.map((a) => (
                    <button
                      key={a.id}
                      className={`pick-item ${targets.has(a.id) ? 'on' : ''}`}
                      onClick={() => toggle(targets, setTargets, a.id)}
                    >
                      <input type="checkbox" className="checkbox" readOnly checked={targets.has(a.id)} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</span>
                    </button>
                  ))}
                  {backups.length === 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      Aucun compte backup. Attribue le rôle « Backup » à un compte.
                    </span>
                  )}
                </div>
              </div>

              <div className="wrap" style={{ alignItems: 'center' }}>
                <select
                  className="field-input"
                  style={{ width: 'auto' }}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as BackupMode)}
                >
                  <option value="incremental">Incrémental</option>
                  <option value="full">Complet</option>
                </select>
                <label className="row" style={{ fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={verify}
                    onChange={(e) => setVerify(e.target.checked)}
                  />
                  Vérifier les checksums
                </label>
                <button
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto' }}
                  onClick={run}
                  disabled={running}
                >
                  {running ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={15} />}
                  {running ? 'En cours…' : 'Lancer'}
                </button>
              </div>

              {progress && (
                <div className="col" style={{ gap: 6 }}>
                  <div className="spread" style={{ fontSize: 12.5 }}>
                    <span className="muted">
                      {accEmail(progress.sourceAccountId).split('@')[0]} →{' '}
                      {accEmail(progress.targetAccountId).split('@')[0]}
                    </span>
                    <span className="muted">
                      {progress.filesDone}/{progress.filesTotal} · {formatBytes(progress.bytesDone)} /{' '}
                      {formatBytes(progress.bytesTotal)}
                    </span>
                  </div>
                  <ProgressBar
                    ratio={progress.bytesTotal > 0 ? progress.bytesDone / progress.bytesTotal : 0}
                    variant="accent"
                  />
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {progress.currentFile || '…'}
                  </span>
                  {progress.errors.length > 0 && (
                    <span style={{ color: 'var(--danger)', fontSize: 11.5 }}>
                      {progress.errors.length} erreur(s) — voir les logs
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Schedules */}
        <div className="col" style={{ gap: 10 }}>
          <div className="spread">
            <span className="section-label" style={{ marginBottom: 0 }}>
              Backups planifiés
            </span>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setShowSched(true)}
              disabled={backups.length === 0 || primaries.length === 0}
            >
              <Plus size={13} /> Planifier
            </button>
          </div>
          {schedules.length === 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>Aucune planification.</span>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="log-line"
                  style={{ gridTemplateColumns: '1fr auto auto', gap: 12 }}
                >
                  <div
                    className="col"
                    style={{ gap: 2, cursor: 'pointer' }}
                    onClick={() => setEditSched(s)}
                  >
                    <span style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>
                      {accEmail(s.sourceAccountId).split('@')[0]} → {accEmail(s.targetAccountId).split('@')[0]}
                    </span>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {s.frequency === 'daily' ? 'Quotidien' : s.frequency === 'weekly' ? 'Hebdo' : 'Mensuel'} à{' '}
                      {s.time} · {s.mode} · prochain {formatRelative(s.nextRun)}
                    </span>
                  </div>
                  <button
                    className={`btn btn-sm ${s.enabled ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => toggleSchedule(s)}
                  >
                    {s.enabled ? 'Actif' : 'Désactivé'}
                  </button>
                  <button className="icon-btn danger" onClick={() => deleteSchedule(s.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        <div className="col" style={{ gap: 10 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Historique
          </span>
          {jobs.length === 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>Aucun backup lancé.</span>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {jobs.map((j) => (
                <div key={j.id} className="log-line" style={{ gridTemplateColumns: '20px 1fr auto' }}>
                  {j.status === 'completed' ? (
                    <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
                  ) : j.status === 'failed' ? (
                    <XCircle size={15} style={{ color: 'var(--danger)' }} />
                  ) : (
                    <Clock size={15} style={{ color: 'var(--warning)' }} />
                  )}
                  <div className="col" style={{ gap: 2 }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>
                      {accEmail(j.sourceAccountId).split('@')[0]} → {accEmail(j.targetAccountId).split('@')[0]}
                      <span className="muted"> · {j.mode}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {j.filesDone}/{j.filesCount} fichiers · {formatBytes(j.bytesTotal)} ·{' '}
                      {formatDate(j.startedAt)}
                      {j.errorMessage ? ` · ${j.errorMessage}` : ''}
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {j.completedAt ? formatDuration(j.completedAt - j.startedAt) : '…'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showSched && (
        <ScheduleModal onClose={() => setShowSched(false)} onSaved={refreshSchedules} />
      )}
      {editSched && (
        <ScheduleModal
          schedule={editSched}
          onClose={() => setEditSched(null)}
          onSaved={refreshSchedules}
        />
      )}
    </div>
  )
}
