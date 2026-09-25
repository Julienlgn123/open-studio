import { X } from 'lucide-react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

const isMac = navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Mise en forme',
    items: [
      [`${mod} + B`, 'Gras'],
      [`${mod} + I`, 'Italique'],
      [`${mod} + U`, 'Souligné'],
      [`${mod} + Shift + S`, 'Barré'],
      [`${mod} + E`, 'Code inline'],
      [`${mod} + Shift + H`, 'Surligner']
    ]
  },
  {
    title: 'Structure',
    items: [
      [`${mod} + Alt + 1/2/3`, 'Titre 1 / 2 / 3'],
      [`${mod} + Shift + 7`, 'Liste numérotée'],
      [`${mod} + Shift + 8`, 'Liste à puces'],
      [`${mod} + Shift + 9`, 'Cases à cocher'],
      [`${mod} + Shift + B`, 'Citation'],
      ['Tab / Shift+Tab', 'Indenter / désindenter']
    ]
  },
  {
    title: 'Raccourcis markdown (à la Notion)',
    items: [
      ['# / ## / ###  puis espace', 'Titres'],
      ['- ou *  puis espace', 'Liste à puces'],
      ['1.  puis espace', 'Liste numérotée'],
      ['>  puis espace', 'Citation'],
      ['``` puis espace', 'Bloc de code'],
      ['**texte**', 'Gras'],
      ['*texte*', 'Italique'],
      ['$formule$', 'Formule LaTeX en ligne'],
      ['$$formule$$', 'Formule LaTeX en bloc'],
      ['/', 'Menu d\'insertion rapide']
    ]
  },
  {
    title: 'Divers',
    items: [
      [`${mod} + S`, 'Sauvegarder'],
      [`${mod} + Z / Shift+Z`, 'Annuler / Rétablir']
    ]
  }
]

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Raccourcis clavier</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                {group.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map(([keys, label]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <code style={{ fontSize: 11.5, background: 'var(--bg-overlay)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}>
                      {keys}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
