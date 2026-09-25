import { useState } from 'react'
import Modal from './Modal'
import { useStore } from '../store'
import type { BackupMode, BackupSchedule, ScheduleFrequency } from '@shared/types'

interface Props {
  schedule?: BackupSchedule
  onClose: () => void
  onSaved: () => void
}

export default function ScheduleModal({ schedule, onClose, onSaved }: Props): JSX.Element {
  const { accounts, toast } = useStore()
  const primaries = accounts.filter((a) => a.role === 'primary')
  const backups = accounts.filter((a) => a.role === 'backup')

  const [sourceAccountId, setSource] = useState(schedule?.sourceAccountId ?? primaries[0]?.id ?? '')
  const [targetAccountId, setTarget] = useState(schedule?.targetAccountId ?? backups[0]?.id ?? '')
  const [frequency, setFrequency] = useState<ScheduleFrequency>(schedule?.frequency ?? 'weekly')
  const [time, setTime] = useState(schedule?.time ?? '02:00')
  const [mode, setMode] = useState<BackupMode>(schedule?.mode ?? 'incremental')
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    if (!sourceAccountId || !targetAccountId || sourceAccountId === targetAccountId) {
      toast('Choisis un compte source et un compte cible différents', 'error')
      return
    }
    setBusy(true)
    try {
      if (schedule) {
        await window.api.schedules.update(schedule.id, { frequency, time, mode })
      } else {
        await window.api.schedules.create({
          sourceAccountId,
          targetAccountId,
          frequency,
          time,
          mode
        })
      }
      toast('Planification enregistrée', 'success')
      onSaved()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={schedule ? 'Modifier la planification' : 'Nouvelle planification'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            Enregistrer
          </button>
        </>
      }
    >
      {!schedule && (
        <>
          <div className="field">
            <label className="field-label">Compte source</label>
            <select className="field-input" value={sourceAccountId} onChange={(e) => setSource(e.target.value)}>
              {primaries.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Compte cible (backup)</label>
            <select className="field-input" value={targetAccountId} onChange={(e) => setTarget(e.target.value)}>
              {backups.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Fréquence</label>
          <select
            className="field-input"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
          >
            <option value="daily">Quotidien</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuel</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Heure</label>
          <input
            className="field-input"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label">Type</label>
        <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value as BackupMode)}>
          <option value="incremental">Incrémental (nouveaux fichiers)</option>
          <option value="full">Complet</option>
        </select>
      </div>
    </Modal>
  )
}
