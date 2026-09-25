import { useState } from 'react'
import { X, Download, Trash2, FolderPlus, RefreshCw, CircleCheck, CircleAlert, CircleDashed, Rocket } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import type { InstallProgress, PullProgress } from '@shared/types'

function formatBytes(n: number | null): string {
  if (!n) return ''
  const gb = n / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} Go`
  return `${(n / 1024 ** 2).toFixed(0)} Mo`
}

const SUGGESTED = ['llama3.2:3b', 'qwen2.5:7b', 'phi4:14b', 'mistral:7b', 'gemma2:9b', 'deepseek-r1:8b']

export default function ModelManagerModal(): JSX.Element | null {
  const open = useChatStore((s) => s.modelManagerOpen)
  const setOpen = useChatStore((s) => s.setModelManagerOpen)
  const engineStatus = useChatStore((s) => s.engineStatus)
  const ollamaModels = useChatStore((s) => s.ollamaModels)
  const llamaModels = useChatStore((s) => s.llamaModels)
  const refreshOllamaModels = useChatStore((s) => s.refreshOllamaModels)
  const refreshLlamaModels = useChatStore((s) => s.refreshLlamaModels)
  const refreshEngines = useChatStore((s) => s.refreshEngines)

  const [pullName, setPullName] = useState('')
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({})
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)

  if (!open) return null

  const startPull = (name: string): void => {
    if (!name.trim()) return
    const stop = window.api.ollama.pull(name.trim(), (p) => {
      setPulls((s) => ({ ...s, [name.trim()]: p }))
      if (p.done) {
        refreshOllamaModels()
        if (!p.error) setTimeout(() => setPulls((s) => { const n = { ...s }; delete n[name.trim()]; return n }), 1500)
      }
    })
    void stop
    setPullName('')
  }

  const startInstallOllama = (): void => {
    setInstallProgress({ phase: 'downloading', percent: 0, message: 'Démarrage…' })
    const stop = window.api.ollama.install((p) => {
      setInstallProgress(p)
      if (p.phase === 'done') {
        refreshEngines()
        refreshOllamaModels()
        setTimeout(() => setInstallProgress(null), 2000)
      }
    })
    void stop
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[36rem] w-[42rem] max-w-full flex-col overflow-hidden rounded-xl border border-base-700 bg-base-900 shadow-panel"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-base-800 px-4">
          <h2 className="text-sm font-semibold text-base-100">Gestion des modèles</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshEngines()
                refreshOllamaModels()
                refreshLlamaModels()
              }}
              className="text-base-400 hover:text-base-100"
              title="Rafraîchir"
            >
              <RefreshCw size={15} />
            </button>
            <button onClick={() => setOpen(false)} className="text-base-400 hover:text-base-100">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Ollama section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-base-100">Ollama</h3>
              {engineStatus?.ollama.available ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CircleCheck size={12} /> connecté {engineStatus.ollama.version && `· v${engineStatus.ollama.version}`}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <CircleAlert size={12} /> non détecté
                </span>
              )}
            </div>

            {!engineStatus?.ollama.available && !installProgress && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-base-700 bg-base-850 p-3">
                <p className="text-xs text-base-400">
                  Ollama n’est pas installé sur cette machine. Installe-le en un clic, directement depuis l’application.
                </p>
                <button
                  onClick={startInstallOllama}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600"
                >
                  <Rocket size={13} />
                  Installer Ollama
                </button>
              </div>
            )}

            {installProgress && (
              <div className="rounded-lg border border-base-700 bg-base-850 p-2.5">
                <div className="flex items-center justify-between text-xs text-base-300">
                  <span className="flex items-center gap-1.5">
                    {installProgress.phase === 'error' ? (
                      <CircleAlert size={12} className="text-red-400" />
                    ) : installProgress.phase === 'done' ? (
                      <CircleCheck size={12} className="text-emerald-400" />
                    ) : (
                      <CircleDashed size={12} className="animate-spin text-accent-400" />
                    )}
                    {installProgress.message}
                  </span>
                  {installProgress.percent !== null && <span>{installProgress.percent}%</span>}
                </div>
                {installProgress.percent !== null && installProgress.phase !== 'error' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-700">
                    <div
                      className="h-full bg-accent-500 transition-all"
                      style={{ width: `${installProgress.percent}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startPull(pullName)}
                placeholder="Nom du modèle à télécharger (ex: llama3.2:3b)"
                className="flex-1 rounded-lg border border-base-700 bg-base-950 px-2.5 py-1.5 text-sm text-base-100 outline-none placeholder:text-base-600 focus:border-accent-500"
              />
              <button
                onClick={() => startPull(pullName)}
                disabled={!pullName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-sm text-white enabled:hover:bg-accent-600 disabled:opacity-30"
              >
                <Download size={14} />
                Télécharger
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => startPull(s)}
                  className="rounded-full border border-base-700 px-2.5 py-1 text-xs text-base-300 hover:bg-base-800"
                >
                  {s}
                </button>
              ))}
            </div>

            {Object.values(pulls).map((p) => (
              <div key={p.model} className="rounded-lg border border-base-700 bg-base-850 p-2.5">
                <div className="flex items-center justify-between text-xs text-base-300">
                  <span className="flex items-center gap-1.5">
                    {p.error ? <CircleAlert size={12} className="text-red-400" /> : <CircleDashed size={12} className="animate-spin text-accent-400" />}
                    {p.model}
                  </span>
                  <span>{p.error ? 'Erreur' : p.status}</span>
                </div>
                {p.error ? (
                  <p className="mt-1 text-xs text-red-400">{p.error}</p>
                ) : (
                  p.total && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-700">
                      <div
                        className="h-full bg-accent-500 transition-all"
                        style={{ width: `${Math.min(100, ((p.completed ?? 0) / p.total) * 100)}%` }}
                      />
                    </div>
                  )
                )}
              </div>
            ))}

            <div className="space-y-1">
              {ollamaModels.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-base-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-base-100">{m.name}</p>
                    <p className="text-xs text-base-500">
                      {[m.paramsLabel, m.quant, formatBytes(m.sizeBytes)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await window.api.ollama.delete(m.id)
                      refreshOllamaModels()
                    }}
                    className="shrink-0 text-base-500 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Local GGUF section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-base-100">Modèles locaux (GGUF, moteur embarqué)</h3>
              <button
                onClick={async () => {
                  await window.api.llamacpp.add()
                  refreshLlamaModels()
                }}
                className="flex items-center gap-1.5 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-200 hover:bg-base-800"
              >
                <FolderPlus size={13} />
                Ajouter un fichier .gguf
              </button>
            </div>
            <p className="text-xs text-base-500">
              Fonctionne sans rien installer : charge un fichier .gguf téléchargé (ex. sur Hugging Face) et discute avec, même
              hors-ligne.
            </p>
            <div className="space-y-1">
              {llamaModels.map((m) => (
                <div key={m.path} className="flex items-center justify-between rounded-lg border border-base-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-base-100">{m.name}</p>
                    <p className="truncate text-xs text-base-500">{m.path}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await window.api.llamacpp.remove(m.path)
                      refreshLlamaModels()
                    }}
                    className="shrink-0 text-base-500 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
