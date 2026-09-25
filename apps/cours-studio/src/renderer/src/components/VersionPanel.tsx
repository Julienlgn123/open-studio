import { useState } from 'react'
import { RotateCcw, Plus, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Course, CourseVersion } from '../../../shared/types'
import Editor from './Editor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Props {
  course: Course
  currentContent: string
  onRestore: (version: CourseVersion) => void
}

export default function VersionPanel({ course, currentContent, onRestore }: Props) {
  const [selected, setSelected] = useState<CourseVersion | null>(null)
  const [saving, setSaving] = useState(false)
  const [versions, setVersions] = useState<CourseVersion[]>(course.versions)

  async function saveCurrentAsVersion() {
    setSaving(true)
    try {
      const v = await api.versions.create({
        courseId: course.id,
        content: currentContent,
        label: `Sauvegarde manuelle`,
        source: 'manual'
      })
      setVersions((prev) => [v, ...prev])
    } finally {
      setSaving(false)
    }
  }

  const sourceLabel: Record<string, string> = {
    manual: 'Manuel',
    ai: 'IA'
  }

  const aiActionLabel: Record<string, string> = {
    improve: 'Amélioration',
    summarize: 'Résumé',
    explain: 'Explication',
    reorganize: 'Réorganisation',
    merge: 'Fusion',
    chat: 'Chat IA'
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left: version list */}
      <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Historique</span>
          <button className="btn btn-secondary btn-sm" onClick={saveCurrentAsVersion} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Plus size={12} />}
            Sauvegarder
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
          {/* Current */}
          <div
            className={`version-item ${!selected ? 'active' : ''}`}
            onClick={() => setSelected(null)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Version actuelle</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>En cours d'édition</div>
            </div>
          </div>

          {versions.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
              Aucune version sauvegardée
            </div>
          )}

          {versions.map((v) => (
            <div
              key={v.id}
              className={`version-item ${selected?.id === v.id ? 'active' : ''}`}
              onClick={() => setSelected(v)}
            >
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.aiAction ? aiActionLabel[v.aiAction] ?? v.label : v.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Clock size={10} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {format(new Date(v.createdAt), 'dd MMM · HH:mm', { locale: fr })}
                  </span>
                  <span style={{
                    marginLeft: 4, fontSize: 10, fontWeight: 600,
                    color: v.source === 'ai' ? 'var(--accent-light)' : 'var(--text-tertiary)',
                    background: v.source === 'ai' ? 'var(--accent-dim)' : 'var(--bg-overlay)',
                    padding: '0 4px', borderRadius: 3
                  }}>
                    {sourceLabel[v.source]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Aperçu — {format(new Date(selected.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => onRestore(selected)}>
                <RotateCcw size={12} /> Restaurer cette version
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
              <Editor content={selected.content} onChange={() => {}} readOnly />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock size={36} style={{ opacity: 0.3 }} /></div>
            <div className="empty-state-title">Sélectionne une version</div>
            <div className="empty-state-desc">Clique sur une version dans l'historique pour la prévisualiser.</div>
          </div>
        )}
      </div>
    </div>
  )
}
