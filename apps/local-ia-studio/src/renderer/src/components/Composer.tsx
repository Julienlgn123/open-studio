import { useEffect, useRef, useState } from 'react'
import { ArrowUp, FileText, FolderSearch, Plus, Square, X } from 'lucide-react'
import type { Attachment, EngineKind } from '@shared/types'
import { imageSrc, readAttachment } from '../lib/readAttachment'

const MAX_ATTACHMENTS = 8

export default function Composer({
  disabled,
  isStreaming,
  engine,
  onSend,
  onStop,
  toolbar,
  variant = 'dock',
  prefill,
  placeholder = 'Écris ton message…',
  extraAction,
  fileAccess
}: {
  disabled: boolean
  isStreaming: boolean
  engine: EngineKind | null
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  /** Contrôles affichés à droite de la barre d'outils (sélecteur de modèle…). */
  toolbar?: React.ReactNode
  /** `hero` : grande carte centrée de l'écran d'accueil ; `dock` : ancrée en bas d'une conversation. */
  variant?: 'hero' | 'dock'
  /** Texte injecté depuis l'extérieur (suggestions de l'accueil) ; `n` change à chaque injection. */
  prefill?: { text: string; n: number }
  placeholder?: string
  /** Bouton de la barre d'outils qui reçoit le texte saisi (ex. « Conseil »). */
  extraAction?: {
    label: string
    icon: React.ReactNode
    title: string
    busy?: boolean
    onClick: (text: string) => void
  }
  /** Interrupteur « le modèle peut lire mes dossiers ». `configured` = au moins un dossier autorisé. */
  fileAccess?: { on: boolean; configured: boolean; onToggle: () => void }
}): JSX.Element {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const maxHeight = variant === 'hero' ? 280 : 240

  const canSend = (!!value.trim() || attachments.length > 0) && !disabled && !isStreaming
  const hasImages = attachments.some((a) => a.kind === 'image')

  const resize = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    if (!prefill || !ref.current) return
    setValue(prefill.text)
    const el = ref.current
    requestAnimationFrame(() => {
      resize(el)
      el.focus()
      el.setSelectionRange(prefill.text.length, prefill.text.length)
    })
  }, [prefill?.n])

  const submit = (): void => {
    if (!canSend) return
    onSend(value.trim(), attachments)
    setValue('')
    setAttachments([])
    setError(null)
    if (ref.current) ref.current.style.height = 'auto'
  }

  const addFiles = async (files: File[]): Promise<void> => {
    setError(null)
    const room = MAX_ATTACHMENTS - attachments.length
    if (files.length > room) setError(`${MAX_ATTACHMENTS} pièces jointes maximum par message.`)
    const read = await Promise.allSettled(files.slice(0, Math.max(0, room)).map(readAttachment))
    const ok = read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = read.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) setError(failed.reason instanceof Error ? failed.reason.message : String(failed.reason))
    if (ok.length) setAttachments((prev) => [...prev, ...ok])
  }

  const notice = error ? (
    <span className="text-red-400">{error}</span>
  ) : engine === 'mistral' && variant === 'dock' ? (
    <span>Mistral (cloud) : tes messages sont envoyés aux serveurs de Mistral.</span>
  ) : hasImages && engine === 'llamacpp' ? (
    <span className="text-amber-500">
      Le moteur embarqué ne lit pas les images : choisis un modèle vision via Ollama (gemma3, llava…).
    </span>
  ) : null

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          addFiles([...e.dataTransfer.files])
        }}
        onClick={() => ref.current?.focus()}
        className={`rounded-[20px] border bg-base-900 shadow-composer transition-colors ${
          dragOver ? 'border-accent-500 bg-accent-500/5' : 'border-base-700 focus-within:border-base-600'
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((a, i) => (
              <div key={i} className="group relative">
                {a.kind === 'image' ? (
                  <img src={imageSrc(a)} alt={a.name} className="h-14 w-14 rounded-lg border border-base-700 object-cover" />
                ) : (
                  <div className="flex h-14 max-w-[12rem] items-center gap-2 rounded-lg border border-base-700 bg-base-850 px-2.5">
                    <FileText size={16} className="shrink-0 text-accent-400" />
                    <span className="truncate text-xs text-base-200">{a.name}</span>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setAttachments((prev) => prev.filter((_, j) => j !== i))
                  }}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-base-700 bg-base-800 text-base-300 opacity-0 transition hover:text-base-50 group-hover:opacity-100"
                  title="Retirer"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={ref}
          value={value}
          placeholder={placeholder}
          rows={variant === 'hero' ? 2 : 1}
          onChange={(e) => {
            setValue(e.target.value)
            resize(e.target)
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.length) {
              e.preventDefault()
              addFiles(files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          className={`block w-full resize-none bg-transparent px-4 text-[15px] leading-6 text-base-100 outline-none placeholder:text-base-500 ${
            variant === 'hero' ? 'min-h-[64px] pt-4' : 'min-h-[24px] pt-3.5'
          }`}
          style={{ maxHeight }}
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              fileInput.current?.click()
            }}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base-400 transition enabled:hover:bg-base-800 enabled:hover:text-base-100 disabled:opacity-30"
            title="Joindre une image ou un fichier texte"
          >
            <Plus size={17} />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          {fileAccess && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                fileAccess.onToggle()
              }}
              title={
                !fileAccess.configured
                  ? 'Autoriser un dossier (Préférences) pour que le modèle lise tes projets'
                  : fileAccess.on
                    ? 'Le modèle a accès à tes dossiers autorisés et à tes anciennes conversations (voir Préférences pour l’écriture) — cliquer pour couper'
                    : 'Donner au modèle l’accès à tes dossiers autorisés'
              }
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition ${
                fileAccess.on && fileAccess.configured
                  ? 'bg-accent-500/15 text-accent-400 hover:bg-accent-500/25'
                  : 'text-base-300 hover:bg-base-800 hover:text-base-100'
              }`}
            >
              <FolderSearch size={14} />
              Fichiers
            </button>
          )}
          {extraAction && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                extraAction.onClick(value.trim())
              }}
              disabled={extraAction.busy}
              title={extraAction.title}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-base-300 transition hover:bg-base-800 hover:text-base-100 disabled:opacity-50"
            >
              {extraAction.icon}
              {extraAction.label}
            </button>
          )}
          <div className="min-w-0 flex-1" />
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
            {toolbar}
          </div>
          {isStreaming ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStop()
              }}
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-100 text-base-950 transition hover:opacity-85"
              title="Arrêter la génération"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                submit()
              }}
              disabled={!canSend}
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
              title="Envoyer (Entrée)"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
      {(notice || variant === 'dock') && (
        <p className="mt-2 min-h-[16px] text-center text-[11px] text-base-500">
          {notice ?? 'Tout reste sur ta machine · les réponses peuvent contenir des erreurs.'}
        </p>
      )}
    </div>
  )
}
