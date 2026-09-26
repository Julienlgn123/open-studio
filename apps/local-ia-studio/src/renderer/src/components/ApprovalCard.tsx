import { useEffect } from 'react'
import { FilePen, FilePlus, FolderInput, FolderPlus, Trash2 } from 'lucide-react'
import type { ApprovalDecision, ToolApproval } from '@shared/types'

const ICONS = { write: FilePlus, edit: FilePen, mkdir: FolderPlus, move: FolderInput, delete: Trash2 }

/** Modification de fichier proposée par le modèle : aperçu + accord de l'utilisateur. */
export default function ApprovalCard({
  approval,
  onAnswer
}: {
  approval: ToolApproval
  onAnswer: (d: ApprovalDecision) => void
}): JSX.Element {
  const Icon = ICONS[approval.kind]
  const danger = approval.kind === 'delete'

  // Entrée = autoriser, Échap = refuser (hors saisie dans le champ de message).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === 'Enter') onAnswer('allow')
      else if (e.key === 'Escape') onAnswer('deny')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer])

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-base-700 bg-base-900">
      <div className="flex items-center gap-2 border-b border-base-800 px-3.5 py-2.5">
        <Icon size={15} className={danger ? 'text-red-400' : 'text-accent-400'} />
        <span className="text-[13px] text-base-100">{approval.title}</span>
        <span className="min-w-0 truncate font-mono text-xs text-base-400" title={approval.path}>
          {approval.path}
        </span>
      </div>
      {approval.preview && (
        <pre className="max-h-72 overflow-auto px-3.5 py-2.5 font-mono text-[11.5px] leading-[18px]">
          {approval.preview.split('\n').map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith('+ ')
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : line.startsWith('- ')
                    ? 'bg-red-500/10 text-red-400'
                    : line.startsWith('@@')
                      ? 'text-base-600'
                      : 'text-base-400'
              }
            >
              {line || ' '}
            </div>
          ))}
        </pre>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-base-800 px-3.5 py-2.5">
        <span className="mr-auto text-[11px] text-base-600">Le modèle attend ta réponse</span>
        <button
          onClick={() => onAnswer('deny')}
          className="rounded-lg px-3 py-1.5 text-xs text-base-300 hover:bg-base-800 hover:text-base-100"
        >
          Refuser
        </button>
        <button
          onClick={() => onAnswer('allow-all')}
          title="Autorise les prochaines modifications de cette réponse sans redemander"
          className="rounded-lg border border-base-700 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800"
        >
          Tout autoriser pour cette réponse
        </button>
        <button
          onClick={() => onAnswer('allow')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
            danger ? 'bg-red-500 hover:bg-red-400' : 'bg-accent-500 hover:bg-accent-400'
          }`}
        >
          Autoriser
        </button>
      </div>
    </div>
  )
}
