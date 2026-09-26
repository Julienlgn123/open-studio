import { useEffect, useState } from 'react'
import { ArrowRight, Columns2, Square, X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import ModelPicker from './ModelPicker'
import Markdown from '../lib/Markdown'
import type { CompareResult, EngineKind } from '@shared/types'

type Target = { engine: EngineKind; model: string } | null
interface Side {
  target: Target
  text: string
  result: CompareResult | null
  running: boolean
}

const empty = (target: Target): Side => ({ target, text: '', result: null, running: false })

function stats(r: CompareResult | null, text: string): string | null {
  if (!r) return null
  const secs = r.ms / 1000
  // ~4 caractères par token : ordre de grandeur, suffisant pour comparer deux modèles.
  const tps = secs > 0 ? Math.round(text.length / 4 / secs) : 0
  return [`${secs.toFixed(1)} s`, r.firstTokenMs != null ? `1er mot ${(r.firstTokenMs / 1000).toFixed(1)} s` : null, tps ? `≈ ${tps} tokens/s` : null]
    .filter(Boolean)
    .join(' · ')
}

/** Même question à deux modèles, réponses côte à côte (vitesse et qualité). */
export default function CompareModal(): JSX.Element | null {
  const open = useChatStore((s) => s.compareOpen)
  const setOpen = useChatStore((s) => s.setCompareOpen)
  const [prompt, setPrompt] = useState('')
  const [sides, setSides] = useState<[Side, Side]>(() => {
    const first = useChatStore.getState().draftModel()
    return [empty(first), empty(null)]
  })
  // À l'ouverture : le modèle de gauche reprend celui en cours d'utilisation.
  useEffect(() => {
    if (open && !sides[0].target) {
      const current = useChatStore.getState().draftModel()
      if (current) setSides((prev) => [{ ...prev[0], target: current }, prev[1]])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!open) return null

  const running = sides.some((s) => s.running)
  const update = (i: 0 | 1, patch: Partial<Side> | ((s: Side) => Partial<Side>)): void =>
    setSides((prev) => {
      const next = [...prev] as [Side, Side]
      next[i] = { ...next[i], ...(typeof patch === 'function' ? patch(next[i]) : patch) }
      return next
    })

  async function runSide(i: 0 | 1, q: string): Promise<void> {
    const target = sides[i].target
    if (!target) return
    update(i, { text: '', result: null, running: true })
    const result = await window.api.compare.run(`slot${i}`, target, q, (chunk) => update(i, (s) => ({ text: s.text + chunk })))
    update(i, { result, running: false })
  }

  function compare(): void {
    const q = prompt.trim()
    if (!q || !sides[0].target || !sides[1].target) return
    void runSide(0, q)
    void runSide(1, q)
  }

  async function keep(i: 0 | 1): Promise<void> {
    const side = sides[i]
    if (!side.target || !side.text) return
    const id = await window.api.compare.keep(side.target, prompt.trim(), side.text)
    await useChatStore.getState().loadInitial()
    useChatStore.getState().selectConversation(id)
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={() => !running && setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[86vh] w-[72rem] max-w-full flex-col overflow-hidden rounded-[20px] border border-base-700 bg-base-850 shadow-panel"
      >
        <div className="flex shrink-0 items-center gap-2 px-6 pb-3 pt-5">
          <Columns2 size={17} className="text-accent-400" />
          <h2 className="text-[17px] font-semibold text-base-100">Comparer deux modèles</h2>
          <button onClick={() => setOpen(false)} className="ml-auto text-base-400 hover:text-base-100" disabled={running}>
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 px-6 pb-3">
          <div className="flex items-end gap-2 rounded-[14px] border border-base-700 bg-base-900 p-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  compare()
                }
              }}
              rows={2}
              placeholder="Pose la même question aux deux modèles…"
              className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-base-100 outline-none placeholder:text-base-500"
            />
            {running ? (
              <button
                onClick={() => [0, 1].forEach((i) => window.api.compare.cancel(`slot${i}`))}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-base-700 px-3 text-sm text-base-200 hover:bg-base-800"
              >
                <Square size={13} /> Arrêter
              </button>
            ) : (
              <button
                onClick={compare}
                disabled={!prompt.trim() || !sides[0].target || !sides[1].target}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-accent-500 px-4 text-sm font-medium text-white hover:bg-accent-400 disabled:opacity-40"
              >
                Comparer
              </button>
            )}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 px-6 pb-6">
          {([0, 1] as const).map((i) => {
            const side = sides[i]
            return (
              <div key={i} className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-base-800 bg-base-900">
                <div className="flex items-center gap-2 border-b border-base-800 px-3 py-2">
                  <ModelPicker
                    engine={side.target?.engine ?? null}
                    model={side.target?.model ?? null}
                    onChange={(engine, model) => update(i, { target: { engine, model }, text: '', result: null })}
                  />
                  <span className="ml-auto text-[11px] text-base-500">{stats(side.result, side.text)}</span>
                </div>
                <div className="selectable min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[14px]">
                  {side.text ? (
                    <Markdown content={side.text} />
                  ) : side.running ? (
                    <p className="text-sm text-base-500">Réflexion…</p>
                  ) : (
                    <p className="text-sm text-base-600">{side.target ? 'La réponse apparaîtra ici.' : 'Choisis un modèle.'}</p>
                  )}
                  {side.result?.error && <p className="mt-2 text-sm text-red-400">{side.result.error}</p>}
                </div>
                {side.result && !side.result.error && side.text && (
                  <button
                    onClick={() => keep(i)}
                    className="flex items-center justify-center gap-1.5 border-t border-base-800 py-2 text-xs text-accent-400 hover:bg-base-850"
                  >
                    Continuer avec cette réponse <ArrowRight size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
