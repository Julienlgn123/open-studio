import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, CircleAlert, CircleDashed, Download, Heart, Search, X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { formatBytes } from '../lib/format'
import type { HfFile, HfModel } from '@shared/types'

// Recherches de départ : des modèles instruct connus qui tournent sur une machine ordinaire.
const SUGGESTED = ['Qwen2.5 7B Instruct', 'Llama 3.2 3B Instruct', 'gemma 2 2b it', 'Mistral 7B Instruct', 'Phi 3.5 mini']
const SEARCH_DELAY_MS = 350

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`
  return String(n)
}

function RepoFiles({ repo }: { repo: string }): JSX.Element {
  const [files, setFiles] = useState<HfFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const startHfDownload = useChatStore((s) => s.startHfDownload)
  const hfDownloads = useChatStore((s) => s.hfDownloads)
  const llamaModels = useChatStore((s) => s.llamaModels)

  useEffect(() => {
    window.api.hf
      .files(repo)
      .then(setFiles)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [repo])

  if (error) return <p className="px-3 pb-2 text-xs text-red-400">{error}</p>
  if (!files) return <p className="px-3 pb-2 text-xs text-base-500">Chargement des fichiers…</p>
  if (!files.length) return <p className="px-3 pb-2 text-xs text-base-500">Aucun fichier .gguf utilisable dans ce dépôt.</p>

  // Par défaut on ne montre que les quantifications courantes (Q4/Q5/Q8) : les autres restent accessibles.
  const common = files.filter((f) => f.quant && /^Q(4_K_M|5_K_M|8_0|4_K_S|6_K)$/.test(f.quant))
  const shown = showAll || common.length === 0 ? files : common

  return (
    <div className="space-y-1 px-3 pb-2">
      {shown.map((f) => {
        const key = `${repo}/${f.name}`
        const busy = hfDownloads[key] && !hfDownloads[key].done
        const installed = llamaModels.some((m) => m.downloaded && m.name === f.name.split('/').pop())
        return (
          <div key={f.name} className="flex items-center justify-between gap-2 rounded-md bg-base-900 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs text-base-200">
                {f.name}
                {f.recommended && (
                  <span className="ml-1.5 rounded bg-accent-500/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-400">
                    recommandé
                  </span>
                )}
              </p>
              <p className="text-[11px] text-base-500">{[f.quant, formatBytes(f.sizeBytes)].filter(Boolean).join(' · ')}</p>
            </div>
            {installed ? (
              <span className="shrink-0 text-[11px] text-emerald-400">installé</span>
            ) : (
              <button
                disabled={busy}
                onClick={() => startHfDownload(repo, f.name)}
                className="flex shrink-0 items-center gap-1 rounded-md bg-accent-500 px-2 py-1 text-[11px] font-medium text-white enabled:hover:bg-accent-400 disabled:opacity-40"
              >
                <Download size={11} />
                Télécharger
              </button>
            )}
          </div>
        )
      })}
      {common.length > 0 && common.length < files.length && (
        <button onClick={() => setShowAll((v) => !v)} className="px-1 text-[11px] text-base-400 hover:text-base-200">
          {showAll ? 'Masquer les autres quantifications' : `Voir les ${files.length} fichiers`}
        </button>
      )}
    </div>
  )
}

export function HfDownloads(): JSX.Element | null {
  const hfDownloads = useChatStore((s) => s.hfDownloads)
  const cancel = useChatStore((s) => s.cancelHfDownload)
  const dismiss = useChatStore((s) => s.dismissHfDownload)
  const list = Object.values(hfDownloads)
  if (!list.length) return null

  return (
    <div className="space-y-1.5">
      {list.map((d) => {
        const pct = d.total ? Math.min(100, (d.received / d.total) * 100) : null
        return (
          <div key={d.key} className="rounded-lg border border-base-700 bg-base-850 p-2.5">
            <div className="flex items-center justify-between gap-2 text-xs text-base-300">
              <span className="flex min-w-0 items-center gap-1.5">
                {d.error ? (
                  <CircleAlert size={12} className="shrink-0 text-red-400" />
                ) : (
                  <CircleDashed size={12} className="shrink-0 animate-spin text-accent-400" />
                )}
                <span className="truncate">{d.file}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {!d.error && (
                  <span>
                    {formatBytes(d.received) || '0 Mo'}
                    {d.total ? ` / ${formatBytes(d.total)}` : ''}
                  </span>
                )}
                {d.error ? (
                  <button onClick={() => dismiss(d.key)} className="text-base-400 hover:text-base-100" title="Fermer">
                    <X size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() => cancel(d.key)}
                    className="rounded px-1.5 py-0.5 text-base-400 hover:bg-base-700 hover:text-base-100"
                  >
                    Annuler
                  </button>
                )}
              </span>
            </div>
            {d.error ? (
              <p className="mt-1 text-xs text-red-400">{d.error}</p>
            ) : (
              pct !== null && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-700">
                  <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function HuggingFacePanel(): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HfModel[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [openRepo, setOpenRepo] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setError(null)
      return
    }
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      window.api.hf
        .search(q)
        .then((r) => alive && (setResults(r), setError(null)))
        .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => alive && setLoading(false))
    }, SEARCH_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-base-700 bg-base-950 px-2.5 py-1.5 focus-within:border-accent-500">
        <Search size={13} className="shrink-0 text-base-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un modèle GGUF sur Hugging Face…"
          className="min-w-0 flex-1 bg-transparent text-sm text-base-100 outline-none placeholder:text-base-600"
        />
        {loading && <CircleDashed size={13} className="shrink-0 animate-spin text-base-500" />}
        {query && !loading && (
          <button onClick={() => setQuery('')} className="shrink-0 text-base-500 hover:text-base-100">
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
              className="rounded-full border border-base-700 px-2.5 py-1 text-xs text-base-300 hover:bg-base-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {results && results.length === 0 && <p className="text-xs text-base-500">Aucun modèle GGUF trouvé.</p>}

      {results && results.length > 0 && (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results.map((m) => (
            <div key={m.id} className="rounded-lg border border-base-800">
              <button
                onClick={() => setOpenRepo((r) => (r === m.id ? null : m.id))}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-base-800/50"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {openRepo === m.id ? (
                    <ChevronDown size={13} className="shrink-0 text-base-500" />
                  ) : (
                    <ChevronRight size={13} className="shrink-0 text-base-500" />
                  )}
                  <span className="truncate text-sm text-base-100">{m.id}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-base-500">
                  <span className="flex items-center gap-0.5">
                    <Download size={10} /> {formatCount(m.downloads)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Heart size={10} /> {formatCount(m.likes)}
                  </span>
                </span>
              </button>
              {openRepo === m.id && <RepoFiles repo={m.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
