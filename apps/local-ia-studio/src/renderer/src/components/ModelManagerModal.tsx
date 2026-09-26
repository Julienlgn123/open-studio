import { useEffect, useRef, useState } from 'react'
import { X, Download, Trash2, FolderPlus, RefreshCw, CircleCheck, CircleAlert, CircleDashed, Rocket, Check } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import type { InstallProgress, PullProgress } from '@shared/types'
import HuggingFacePanel, { HfDownloads } from './HuggingFacePanel'
import { formatBytes } from '../lib/format'
import MachinePanel from './MachinePanel'
import LmStudioSection from './LmStudioSection'


const SUGGESTED = ['llama3.2:3b', 'qwen2.5:7b', 'phi4:14b', 'mistral:7b', 'gemma2:9b', 'deepseek-r1:8b']

const isRunning = (phase: InstallProgress['phase']): boolean =>
  phase === 'downloading' || phase === 'installing' || phase === 'waiting'

function ConfirmInline({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }): JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="text-red-300">{label}</span>
      <button onClick={onConfirm} className="rounded p-0.5 text-red-400 hover:bg-red-500/20" title="Confirmer">
        <Check size={13} />
      </button>
      <button onClick={onCancel} className="text-base-400 hover:text-base-100" title="Annuler">
        <X size={13} />
      </button>
    </span>
  )
}

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Fonctions d'annulation renvoyées par le preload, gardées pour les boutons « Annuler ».
  const stopPull = useRef<Record<string, () => void>>({})
  const stopInstall = useRef<(() => void) | null>(null)
  const pendingPull = useChatStore((s) => s.pendingPull)

  // Téléchargement demandé par le conseiller : lancé dès que la fenêtre s'ouvre
  // (ou pré-rempli si Ollama n'est pas encore installé).
  useEffect(() => {
    if (!open || !pendingPull) return
    const name = useChatStore.getState().consumePendingPull()
    if (!name) return
    if (useChatStore.getState().engineStatus?.ollama.available) startPull(name)
    else setPullName(name)
  }, [open, pendingPull])

  if (!open) return null

  const removePull = (name: string): void => {
    delete stopPull.current[name]
    setPulls((s) => {
      const n = { ...s }
      delete n[name]
      return n
    })
  }

  const startPull = (raw: string): void => {
    const name = raw.trim()
    if (!name || stopPull.current[name]) return
    setPulls((s) => ({
      ...s,
      [name]: { model: name, status: 'démarrage…', completed: null, total: null, done: false, error: null }
    }))
    stopPull.current[name] = window.api.ollama.pull(name, (p) => {
      setPulls((s) => ({ ...s, [name]: p }))
      if (p.done) {
        delete stopPull.current[name]
        refreshOllamaModels()
        if (!p.error) setTimeout(() => removePull(name), 1500)
      }
    })
    setPullName('')
  }

  const cancelPull = (name: string): void => {
    stopPull.current[name]?.()
    removePull(name)
  }

  const startInstallOllama = (): void => {
    setInstallProgress({ phase: 'downloading', percent: 0, message: 'Démarrage…' })
    stopInstall.current = window.api.ollama.install((p) => {
      setInstallProgress(p)
      if (!isRunning(p.phase)) stopInstall.current = null
      if (p.phase === 'done') {
        refreshEngines()
        refreshOllamaModels()
        setTimeout(() => setInstallProgress(null), 2000)
      }
    })
  }

  const cancelInstall = (): void => {
    stopInstall.current?.()
    stopInstall.current = null
    setInstallProgress(null)
  }

  const deleteOllamaModel = async (id: string): Promise<void> => {
    setConfirmDelete(null)
    setDeleteError(null)
    try {
      await window.api.ollama.delete(id)
    } catch (err) {
      setDeleteError(`Impossible de supprimer ${id} : ${err instanceof Error ? err.message : String(err)}`)
    }
    refreshOllamaModels()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[36rem] w-[42rem] max-w-full flex-col overflow-hidden rounded-[20px] border border-base-700 bg-base-850 shadow-panel"
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-[17px] font-semibold text-base-100">Gestion des modèles</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshEngines()
                refreshOllamaModels()
                refreshLlamaModels()
                useChatStore.getState().refreshLmStudioModels()
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

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <MachinePanel onDownload={(name) => (engineStatus?.ollama.available ? startPull(name) : setPullName(name))} />

          {/* Sur Mac, MLX (via LM Studio) passe en premier : c'est le plus rapide sur Apple Silicon. */}
          {/Mac/i.test(navigator.platform) && <LmStudioSection />}

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
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-400"
                >
                  <Rocket size={13} />
                  Installer Ollama
                </button>
              </div>
            )}

            {installProgress && (
              <div className="rounded-lg border border-base-700 bg-base-850 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs text-base-300">
                  <span className="flex items-center gap-1.5">
                    {installProgress.phase === 'error' || installProgress.phase === 'cancelled' ? (
                      <CircleAlert size={12} className="shrink-0 text-red-400" />
                    ) : installProgress.phase === 'done' ? (
                      <CircleCheck size={12} className="shrink-0 text-emerald-400" />
                    ) : (
                      <CircleDashed size={12} className="shrink-0 animate-spin text-accent-400" />
                    )}
                    {installProgress.message}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {installProgress.percent !== null && isRunning(installProgress.phase) && (
                      <span>{installProgress.percent}%</span>
                    )}
                    {isRunning(installProgress.phase) ? (
                      <button
                        onClick={cancelInstall}
                        className="rounded px-1.5 py-0.5 text-base-400 hover:bg-base-700 hover:text-base-100"
                      >
                        Annuler
                      </button>
                    ) : (
                      installProgress.phase !== 'done' && (
                        <button onClick={() => setInstallProgress(null)} className="text-base-400 hover:text-base-100" title="Fermer">
                          <X size={12} />
                        </button>
                      )
                    )}
                  </span>
                </div>
                {installProgress.percent !== null && isRunning(installProgress.phase) && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-700">
                    <div className="h-full bg-accent-500 transition-all" style={{ width: `${installProgress.percent}%` }} />
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
                className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-sm text-white enabled:hover:bg-accent-400 disabled:opacity-30"
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
                <div className="flex items-center justify-between gap-2 text-xs text-base-300">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {p.error ? (
                      <CircleAlert size={12} className="shrink-0 text-red-400" />
                    ) : p.done ? (
                      <CircleCheck size={12} className="shrink-0 text-emerald-400" />
                    ) : (
                      <CircleDashed size={12} className="shrink-0 animate-spin text-accent-400" />
                    )}
                    <span className="truncate">{p.model}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span>
                      {p.error
                        ? 'Erreur'
                        : p.total && !p.done
                          ? `${p.status} · ${Math.round(((p.completed ?? 0) / p.total) * 100)}%`
                          : p.status}
                    </span>
                    {!(p.done && !p.error) && (
                      <button
                        onClick={() => cancelPull(p.model)}
                        className="rounded px-1.5 py-0.5 text-base-400 hover:bg-base-700 hover:text-base-100"
                      >
                        {p.error ? 'Fermer' : 'Annuler'}
                      </button>
                    )}
                  </span>
                </div>
                {p.error ? (
                  <p className="mt-1 text-xs text-red-400">{p.error}</p>
                ) : (
                  !!p.total &&
                  !p.done && (
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

            {deleteError && (
              <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-300">
                <CircleAlert size={12} className="mt-0.5 shrink-0" />
                <span className="flex-1">{deleteError}</span>
                <button onClick={() => setDeleteError(null)} className="shrink-0 hover:text-red-100">
                  <X size={12} />
                </button>
              </p>
            )}

            <div className="space-y-1">
              {ollamaModels.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-base-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-base-100">{m.name}</p>
                    <p className="text-xs text-base-500">
                      {[m.paramsLabel, m.quant, formatBytes(m.sizeBytes)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {confirmDelete === m.id ? (
                    <ConfirmInline
                      label="Supprimer du disque ?"
                      onConfirm={() => deleteOllamaModel(m.id)}
                      onCancel={() => setConfirmDelete(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(m.id)}
                      className="shrink-0 text-base-500 hover:text-red-400"
                      title="Supprimer le modèle"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {!/Mac/i.test(navigator.platform) && <LmStudioSection />}

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
              Fonctionne sans rien installer, même hors-ligne : télécharge un modèle depuis Hugging Face ci-dessous, ou ajoute
              un fichier .gguf déjà présent sur ton disque.
            </p>

            <HuggingFacePanel />
            <HfDownloads />

            <div className="space-y-1">
              {llamaModels.map((m) => (
                <div key={m.path} className="flex items-center justify-between gap-2 rounded-lg border border-base-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-base-100">
                      {m.name}
                      {m.downloaded && (
                        <span className="ml-1.5 rounded bg-base-800 px-1.5 py-0.5 text-[10px] text-base-400">téléchargé</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-base-500">{m.path}</p>
                  </div>
                  {confirmDelete === m.path ? (
                    <ConfirmInline
                      label={m.downloaded ? 'Supprimer du disque ?' : 'Retirer de la liste ?'}
                      onConfirm={async () => {
                        setConfirmDelete(null)
                        await window.api.llamacpp.remove(m.path)
                        refreshLlamaModels()
                      }}
                      onCancel={() => setConfirmDelete(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(m.path)}
                      className="shrink-0 text-base-500 hover:text-red-400"
                      title={m.downloaded ? 'Supprimer le modèle' : 'Retirer de la liste (le fichier reste sur le disque)'}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
