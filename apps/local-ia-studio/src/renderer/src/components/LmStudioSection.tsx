import { useEffect, useState } from 'react'
import { Apple, CircleAlert, CircleCheck, CircleDashed, Download, ExternalLink, Search, X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { formatBytes } from '../lib/format'
import type { HfDownloadProgress, HfModel } from '@shared/types'

const IS_MAC = /Mac/i.test(navigator.platform)
// Bons points de départ MLX (quantifiés 4 bits, ~2 à 9 Go).
const SUGGESTED = ['Qwen3 8B 4bit', 'Llama 3.2 3B 4bit', 'gemma-3 4b 4bit', 'Mistral 7B 4bit', 'Qwen2.5 Coder 7B 4bit']
const SEARCH_DELAY_MS = 350

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`
  return String(n)
}

function FormatBadge({ format }: { format: string | null }): JSX.Element | null {
  if (!format) return null
  const mlx = format === 'mlx'
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        mlx ? 'bg-accent-500/20 text-accent-400' : 'bg-base-800 text-base-400'
      }`}
    >
      {format.toUpperCase()}
    </span>
  )
}

/** Téléchargement d'un modèle MLX dans le dossier de LM Studio. */
function MlxResult({ m, onDone }: { m: HfModel; onDone: () => void }): JSX.Element {
  const [size, setSize] = useState<number | null>(null)
  const [progress, setProgress] = useState<HfDownloadProgress | null>(null)
  const installed = useChatStore((s) => s.lmstudioModels.some((x) => x.id.toLowerCase().includes((m.id.split('/').pop() ?? '').toLowerCase())))
  const busy = !!progress && !progress.done

  useEffect(() => {
    window.api.mlx.size(m.id).then(setSize).catch(() => setSize(null))
  }, [m.id])

  async function download(): Promise<void> {
    await window.api.mlx.download(m.id, setProgress)
    onDone()
  }

  const pct = progress?.total ? Math.min(100, (progress.received / progress.total) * 100) : null
  return (
    <div className="rounded-md bg-base-900 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-base-200">{m.id}</p>
          <p className="text-[11px] text-base-500">
            {[size ? formatBytes(size) : null, `${formatCount(m.downloads)} téléchargements`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {installed || (progress?.done && !progress.error && !progress.cancelled) ? (
          <span className="shrink-0 text-[11px] text-emerald-400">installé</span>
        ) : busy ? (
          <button
            onClick={() => window.api.mlx.cancel(m.id)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-base-400 hover:bg-base-700 hover:text-base-100"
          >
            Annuler
          </button>
        ) : (
          <button
            onClick={download}
            className="flex shrink-0 items-center gap-1 rounded-md bg-accent-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-400"
          >
            <Download size={11} />
            Télécharger
          </button>
        )}
      </div>
      {busy && (
        <div className="mt-1.5">
          <div className="mb-1 flex justify-between text-[11px] text-base-500">
            <span className="flex items-center gap-1">
              <CircleDashed size={11} className="animate-spin text-accent-400" /> Téléchargement
            </span>
            <span>
              {formatBytes(progress!.received) || '0 Mo'}
              {progress!.total ? ` / ${formatBytes(progress!.total)}` : ''}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-base-700">
            <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
      )}
      {progress?.error && <p className="mt-1 text-[11px] text-red-400">{progress.error}</p>}
    </div>
  )
}

export default function LmStudioSection(): JSX.Element {
  const engineStatus = useChatStore((s) => s.engineStatus)
  const models = useChatStore((s) => s.lmstudioModels)
  const refresh = useChatStore((s) => s.refreshLmStudioModels)
  const available = !!engineStatus?.lmstudio?.available
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HfModel[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!IS_MAC) return
    const t = setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        setResults(await window.api.mlx.search(query || 'mlx-community 4bit'))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSearching(false)
      }
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [query])

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-base-100">LM Studio · modèles MLX</h3>
        {available ? (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CircleCheck size={12} /> connecté
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <CircleAlert size={12} /> non détecté
          </span>
        )}
      </div>

      <p className="text-xs leading-5 text-base-500">
        {IS_MAC ? (
          <>
            <Apple size={11} className="mr-1 inline -translate-y-px" />
            Sur Mac Apple Silicon, les modèles <strong className="text-base-300">MLX</strong> sont optimisés pour la puce M1/M2/M3/M4 :
            nettement plus rapides que les GGUF pour la même qualité. LM Studio les fait tourner.
          </>
        ) : (
          <>Les modèles MLX ne tournent que sur Mac Apple Silicon. Sur ce PC, LM Studio peut quand même servir ses modèles GGUF.</>
        )}
      </p>

      {!available && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-base-700 bg-base-850 p-3">
          <p className="text-xs text-base-400">
            Installe LM Studio, ouvre-le, puis active le serveur local : onglet <strong className="text-base-300">Developer</strong> →{' '}
            <strong className="text-base-300">Start Server</strong>. Local IA Studio le détecte tout seul.
          </p>
          <a
            href="https://lmstudio.ai/download"
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-400"
          >
            <ExternalLink size={13} /> LM Studio
          </a>
        </div>
      )}

      {models.length > 0 && (
        <div className="space-y-1">
          {models.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-base-800 px-3 py-2">
              <p className="min-w-0 truncate text-sm text-base-100">
                {m.name}
                <FormatBadge format={m.format} />
                {m.vision && <span className="ml-1.5 rounded bg-base-800 px-1.5 py-0.5 text-[10px] text-base-400">images</span>}
              </p>
              <span className="shrink-0 text-[11px] text-base-500">{m.loaded ? 'chargé' : m.quant ?? ''}</span>
            </div>
          ))}
        </div>
      )}

      {IS_MAC && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-base-700 bg-base-900 px-2.5">
            <Search size={13} className="text-base-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un modèle MLX sur Hugging Face (ex. qwen3 8b)"
              className="h-8 flex-1 bg-transparent text-xs text-base-100 outline-none placeholder:text-base-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-base-500 hover:text-base-200">
                <X size={12} />
              </button>
            )}
          </div>
          {!query && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="rounded-full border border-base-700 px-2.5 py-0.5 text-[11px] text-base-300 hover:bg-base-800"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {searching && !results && <p className="text-xs text-base-500">Recherche…</p>}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {results?.map((m) => <MlxResult key={m.id} m={m} onDone={refresh} />)}
            {results && !results.length && <p className="text-xs text-base-500">Aucun modèle MLX trouvé.</p>}
          </div>
          <p className="text-[11px] text-base-600">
            Le modèle est rangé dans le dossier de LM Studio (~/.lmstudio/models) : il apparaît dans LM Studio et ici.
          </p>
        </div>
      )}
    </section>
  )
}
