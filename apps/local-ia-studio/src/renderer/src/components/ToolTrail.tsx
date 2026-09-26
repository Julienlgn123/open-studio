import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderSearch } from 'lucide-react'

const WRITE_PREFIX = /^(Écrit|Modifie|Crée|Déplace|Met |Lance|Ouvre|Arrête)/

/** Ce que le modèle a consulté (fichiers lus, recherches…) : dépliable, ou en direct pendant la génération. */
export default function ToolTrail({ items, live }: { items: string[]; live?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const shown = live ? items.slice(-4) : open ? items : []

  return (
    <div className="mb-2.5">
      <button
        onClick={() => !live && setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-xs text-base-400 ${live ? 'cursor-default' : 'hover:text-base-200'}`}
      >
        <FolderSearch size={13} className={live ? 'animate-pulse text-accent-400' : 'text-accent-400'} />
        {live
          ? `${items.length} action${items.length > 1 ? 's' : ''}…`
          : `${items.length} action${items.length > 1 ? 's' : ''} sur les fichiers`}
        {!live && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>
      {shown.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-l border-base-700 pl-3">
          {shown.map((t, i) => (
            <li
              key={i}
              className={`truncate font-mono text-[11.5px] ${
                t.endsWith('— refusé') ? 'text-base-600 line-through' : WRITE_PREFIX.test(t) ? 'text-accent-400' : 'text-base-400'
              }`}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
