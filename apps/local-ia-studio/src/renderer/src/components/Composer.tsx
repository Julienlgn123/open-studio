import { useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'

export default function Composer({
  disabled,
  isStreaming,
  onSend,
  onStop
}: {
  disabled: boolean
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}): JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const submit = (): void => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  return (
    <div className="border-t border-base-800 bg-base-950 p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-base-700 bg-base-900 px-3 py-2 shadow-panel focus-within:border-accent-500">
        <textarea
          ref={ref}
          value={value}
          placeholder="Écris ton message…"
          rows={1}
          onChange={(e) => {
            setValue(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-60 min-h-[24px] flex-1 resize-none bg-transparent text-[15px] leading-6 text-base-100 outline-none placeholder:text-base-500"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-700 text-base-100 transition hover:bg-base-600"
            title="Arrêter la génération"
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!value.trim() || disabled}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white transition enabled:hover:bg-accent-600 disabled:opacity-30"
          >
            <ArrowUp size={15} />
          </button>
        )}
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-base-600">
        Entrée pour envoyer · Maj+Entrée pour un saut de ligne
      </p>
    </div>
  )
}
