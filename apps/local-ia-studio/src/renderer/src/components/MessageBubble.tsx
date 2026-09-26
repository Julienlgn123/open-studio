import { useState } from 'react'
import { Check, Copy, FileText, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import Markdown from '../lib/Markdown'
import LogoMark from './LogoMark'
import ToolTrail from './ToolTrail'
import type { Attachment, ChatMessage } from '@shared/types'
import { imageSrc } from '../lib/readAttachment'

function ActionButton({
  title,
  onClick,
  danger,
  children
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded p-1 text-base-500 transition hover:bg-base-800 ${danger ? 'hover:text-red-400' : 'hover:text-base-100'}`}
    >
      {children}
    </button>
  )
}

function Attachments({ items }: { items: Attachment[] }): JSX.Element {
  const [zoomed, setZoomed] = useState<string | null>(null)
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((a, i) =>
        a.kind === 'image' ? (
          <button key={i} onClick={() => setZoomed(imageSrc(a))} title={a.name}>
            <img src={imageSrc(a)} alt={a.name} className="max-h-40 max-w-[16rem] rounded-lg border border-base-700 object-cover" />
          </button>
        ) : (
          <div
            key={i}
            title={`${a.content.length.toLocaleString('fr-FR')} caractères`}
            className="flex max-w-[16rem] items-center gap-2 rounded-lg border border-base-700 bg-base-850 px-2.5 py-1.5"
          >
            <FileText size={14} className="shrink-0 text-accent-400" />
            <span className="truncate text-xs text-base-200">{a.name}</span>
          </div>
        )
      )}
      {zoomed && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-8" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}

export default function MessageBubble({
  message,
  canAct,
  canRegenerate,
  onRegenerate,
  onEdit,
  onDelete
}: {
  message: ChatMessage
  /** Faux pendant une génération : les actions qui modifient l'historique sont masquées. */
  canAct: boolean
  canRegenerate: boolean
  onRegenerate: () => void
  onEdit: (content: string) => void
  onDelete: () => void
}): JSX.Element {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submitEdit = (): void => {
    const text = draft.trim()
    setEditing(false)
    if (text && text !== message.content) onEdit(text)
  }

  const editor = (
    <div className="w-full space-y-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submitEdit()
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        rows={Math.min(10, Math.max(2, draft.split('\n').length))}
        className="w-full resize-y rounded-2xl border border-base-700 bg-base-900 px-4 py-3 text-[15px] leading-6 text-base-100 outline-none focus:border-accent-500"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs text-base-300 hover:bg-base-800">
          Annuler
        </button>
        <button
          onClick={submitEdit}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-400"
        >
          Envoyer
        </button>
      </div>
    </div>
  )

  const actions = (
    <div
      className={`mt-1 flex h-7 items-center gap-0.5 transition ${isUser ? 'justify-end' : ''} ${
        canRegenerate && !isUser ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      {confirmDelete ? (
        <>
          <span className="mr-1 text-xs text-base-400">Supprimer ce message ?</span>
          <ActionButton title="Confirmer" danger onClick={onDelete}>
            <Check size={14} />
          </ActionButton>
          <button onClick={() => setConfirmDelete(false)} className="rounded px-1.5 text-xs text-base-400 hover:text-base-100">
            Annuler
          </button>
        </>
      ) : (
        <>
          <ActionButton
            title="Copier"
            onClick={() => {
              navigator.clipboard.writeText(message.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ActionButton>
          {canAct && isUser && (
            <ActionButton
              title="Modifier et renvoyer"
              onClick={() => {
                setDraft(message.content)
                setEditing(true)
              }}
            >
              <Pencil size={14} />
            </ActionButton>
          )}
          {canAct && canRegenerate && (
            <ActionButton title="Régénérer la réponse" onClick={onRegenerate}>
              <RefreshCw size={14} />
            </ActionButton>
          )}
          {canAct && (
            <ActionButton title="Supprimer" danger onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
            </ActionButton>
          )}
        </>
      )}
    </div>
  )

  if (isUser) {
    return (
      <div className="group animate-fade-up px-4 pt-6">
        <div className="flex flex-col items-end">
          {!!message.attachments?.length && <Attachments items={message.attachments} />}
          {editing
            ? editor
            : message.content && (
                <div className="selectable max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-base-800 px-4 py-2.5 text-[15px] leading-7 text-base-50">
                  {message.content}
                </div>
              )}
        </div>
        {!editing && actions}
      </div>
    )
  }

  return (
    <div className="group animate-fade-up flex gap-3.5 px-4 pt-6">
      <div className="mt-0.5 shrink-0">
        <LogoMark size={24} />
      </div>
      <div className="selectable min-w-0 flex-1 pt-px">
        {!!message.attachments?.length && <Attachments items={message.attachments} />}
        {!!message.tools?.length && <ToolTrail items={message.tools} />}
        <Markdown content={message.content} />
        {message.notice && (
          <p className="mt-2 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">{message.notice}</p>
        )}
        {actions}
      </div>
    </div>
  )
}
