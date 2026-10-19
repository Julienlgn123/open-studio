import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, Check, FileText, FolderPlus, Library, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import type { KbDoc, KbHit, KbProgress } from '@shared/types'
import { useChatStore } from '../store/chatStore'

const fmtBytes = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`)

/** Gestion des bibliothèques de documents : ajout de fichiers/dossiers, mise à jour, essai de recherche. */
export default function LibraryModal(): JSX.Element | null {
  const open = useChatStore((s) => s.libraryOpen)
  const setOpen = useChatStore((s) => s.setLibraryOpen)
  const collections = useChatStore((s) => s.kbCollections)
  const refreshKb = useChatStore((s) => s.refreshKb)
  const [sel, setSel] = useState<string | null>(null)
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [progress, setProgress] = useState<KbProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<KbHit[] | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const newName = useRef<HTMLInputElement>(null)

  useEffect(() => window.api.kb.onProgress(setProgress), [])
  useEffect(() => {
    if (open) void refreshKb()
  }, [open])
  useEffect(() => {
    if (!sel && collections.length) setSel(collections[0].id)
    if (sel && !collections.some((c) => c.id === sel)) setSel(collections[0]?.id ?? null)
  }, [collections, sel])
  const loadDocs = (): void => {
    if (sel) void window.api.kb.docs(sel).then(setDocs)
    else setDocs([])
  }
  useEffect(() => {
    loadDocs()
    setHits(null)
    setConfirmDelete(false)
  }, [sel])

  if (!open) return null
  const cur = collections.find((c) => c.id === sel) ?? null

  const run = async (fn: () => Promise<{ added?: number; skipped?: number; failed?: number; updated?: number; removed?: number } | null>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fn()
      if (r) {
        const parts = [
          r.added != null && `${r.added} ajouté${r.added > 1 ? 's' : ''}`,
          r.updated != null && `${r.updated} mis à jour`,
          r.skipped ? `${r.skipped} déjà à jour` : null,
          r.removed ? `${r.removed} retiré${r.removed > 1 ? 's' : ''} (introuvables)` : null,
          r.failed ? `${r.failed} illisible${r.failed > 1 ? 's' : ''}` : null
        ].filter(Boolean)
        setMessage(parts.join(' · ') || 'Rien à faire.')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress(null)
      loadDocs()
      void refreshKb()
    }
  }

  const create = async (): Promise<void> => {
    const c = await window.api.kb.create(name.trim() || 'Ma bibliothèque')
    setName('')
    await refreshKb()
    setSel(c.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={() => !busy && setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-[84vh] w-[64rem] max-w-full flex-col overflow-hidden rounded-[20px] border border-base-700 bg-base-850 shadow-panel">
        <div className="flex shrink-0 items-center gap-2 px-6 pb-3 pt-5">
          <Library size={17} className="text-accent-400" />
          <h2 className="text-[17px] font-semibold text-base-100">Bibliothèque de documents</h2>
          <span className="text-xs text-base-500">Le modèle cherche dans tes fichiers avant de répondre, et cite ses sources.</span>
          <button onClick={() => setOpen(false)} className="ml-auto text-base-400 hover:text-base-100" disabled={busy}>
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 border-t border-base-800">
          {/* Bibliothèques */}
          <div className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-base-800 p-3">
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setSel(c.id)}
                className={`flex flex-col items-start rounded-[10px] px-3 py-2 text-left ${c.id === sel ? 'bg-accent-500/15 text-accent-300' : 'text-base-200 hover:bg-base-800'}`}
              >
                <span className="flex w-full items-center gap-1.5 truncate text-[13px] font-medium">
                  <BookOpen size={13} className="shrink-0" /> <span className="truncate">{c.name}</span>
                </span>
                <span className="text-[11px] text-base-500">
                  {c.docs} fichier{c.docs > 1 ? 's' : ''} · {fmtBytes(c.bytes)}
                </span>
              </button>
            ))}
            <div className="mt-2 flex gap-1">
              <input
                ref={newName}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
                placeholder="Nouvelle (ex. Cours)"
                className="h-8 min-w-0 flex-1 rounded-[10px] border border-base-700 bg-base-900 px-2.5 text-xs text-base-100 outline-none placeholder:text-base-500 focus:border-accent-500"
              />
              <button onClick={() => void create()} className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-base-700 text-base-200 hover:bg-base-800" title="Créer">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Contenu */}
          <div
            className={`relative flex min-w-0 flex-1 flex-col ${dragOver ? 'bg-accent-500/5' : ''}`}
            onDragOver={(e) => {
              if (!cur) return
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (!cur) return
              const paths = [...e.dataTransfer.files].map((f) => window.api.kb.pathFor(f)).filter(Boolean)
              if (paths.length) void run(() => window.api.kb.addPaths(cur.id, paths))
            }}
          >
            {!cur ? (
              <div className="m-auto max-w-sm text-center text-sm text-base-400">
                <Library size={28} className="mx-auto mb-3 text-base-500" />
                Crée une bibliothèque (Cours, Projet, Factures…), ajoute tes PDF, documents Word, notes ou dossiers de code, puis branche-la sur une conversation avec le bouton
                « Bibliothèque » sous la zone de saisie.
                <button onClick={() => newName.current?.focus()} className="mx-auto mt-4 flex items-center gap-1.5 rounded-[10px] bg-accent-500 px-3 py-1.5 text-[13px] text-white">
                  <Plus size={14} /> Créer une bibliothèque
                </button>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 py-3">
                  {renaming === cur.id ? (
                    <input
                      autoFocus
                      defaultValue={cur.name}
                      onBlur={async (e) => {
                        if (e.target.value.trim()) await window.api.kb.rename(cur.id, e.target.value)
                        setRenaming(null)
                        void refreshKb()
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="h-8 rounded-[10px] border border-accent-500 bg-base-900 px-2.5 text-sm text-base-100 outline-none"
                    />
                  ) : (
                    <h3 className="flex items-center gap-2 text-[15px] font-semibold text-base-100">
                      {cur.name}
                      <button onClick={() => setRenaming(cur.id)} className="text-base-500 hover:text-base-200" title="Renommer">
                        <Pencil size={12} />
                      </button>
                    </h3>
                  )}
                  <span className="text-xs text-base-500">{cur.chunks} extraits indexés</span>
                  <div className="ml-auto flex gap-1.5">
                    <Btn onClick={() => void run(() => window.api.kb.pick(cur.id, false))} disabled={busy} icon={<FileText size={13} />} label="Fichiers" />
                    <Btn onClick={() => void run(() => window.api.kb.pick(cur.id, true))} disabled={busy} icon={<FolderPlus size={13} />} label="Dossier" />
                    <Btn onClick={() => void run(() => window.api.kb.refresh(cur.id))} disabled={busy || !docs.length} icon={<RefreshCw size={13} />} label="Mettre à jour" title="Relire les fichiers modifiés depuis l’ajout" />
                    {confirmDelete ? (
                      <Btn
                        danger
                        onClick={async () => {
                          await window.api.kb.delete(cur.id)
                          setConfirmDelete(false)
                          void refreshKb()
                        }}
                        icon={<Check size={13} />}
                        label="Supprimer ?"
                      />
                    ) : (
                      <Btn onClick={() => setConfirmDelete(true)} icon={<Trash2 size={13} />} label="" title="Supprimer la bibliothèque (tes fichiers ne sont pas touchés)" />
                    )}
                  </div>
                </div>

                {(busy || message) && (
                  <div className="mx-5 mb-2 flex items-center gap-2 rounded-[10px] border border-base-700 bg-base-900 px-3 py-2 text-xs text-base-300">
                    {busy ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-accent-400" />
                        {progress && progress.total ? `Indexation ${progress.done}/${progress.total} · ${progress.name}` : 'Recherche des fichiers…'}
                      </>
                    ) : (
                      message
                    )}
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-5">
                  {docs.length === 0 && !busy && (
                    <div className="mt-10 rounded-[14px] border border-dashed border-base-700 p-8 text-center text-sm text-base-400">
                      Glisse des fichiers ou des dossiers ici, ou utilise les boutons ci-dessus.
                      <div className="mt-1 text-xs text-base-500">PDF, Word (.docx), OpenDocument (.odt), texte, Markdown, CSV, code…</div>
                    </div>
                  )}
                  {docs.map((d) => (
                    <div key={d.id} className="group flex items-center gap-2.5 border-b border-base-800/70 py-1.5 text-[13px]">
                      {d.error ? <AlertTriangle size={14} className="shrink-0 text-amber-400" /> : <FileText size={14} className="shrink-0 text-base-500" />}
                      <span className="min-w-0 flex-1 truncate text-base-200" title={d.path}>
                        {d.name}
                        {d.error && <span className="ml-2 text-xs text-amber-400/80">{d.error}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-base-500">{d.chunks} extr.</span>
                      <span className="w-16 shrink-0 text-right text-xs text-base-500">{fmtBytes(d.size)}</span>
                      <button
                        onClick={async () => {
                          await window.api.kb.removeDoc(d.id)
                          loadDocs()
                          void refreshKb()
                        }}
                        className="shrink-0 text-base-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
                        title="Retirer de la bibliothèque"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {docs.length > 0 && (
                  <div className="shrink-0 border-t border-base-800 px-5 py-3">
                    <div className="flex items-center gap-2 rounded-[10px] border border-base-700 bg-base-900 px-3">
                      <Search size={13} className="text-base-500" />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={async (e) => e.key === 'Enter' && setHits(await window.api.kb.search([cur.id], q))}
                        placeholder="Essayer une recherche : ce que le modèle trouverait pour cette question (Entrée)"
                        className="h-9 flex-1 bg-transparent text-[13px] text-base-100 outline-none placeholder:text-base-500"
                      />
                    </div>
                    {hits && (
                      <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                        {hits.length === 0 && <p className="text-xs text-base-500">Aucun extrait ne correspond.</p>}
                        {hits.map((h, i) => (
                          <div key={i} className="rounded-[10px] bg-base-900 px-3 py-2 text-xs text-base-300">
                            <b className="text-base-200">
                              [{i + 1}] {h.name}
                            </b>{' '}
                            <span className="text-base-500">extrait {h.idx + 1}</span>
                            <p className="mt-0.5 line-clamp-2">{h.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Btn({ onClick, disabled, icon, label, title, danger }: { onClick: () => void; disabled?: boolean; icon: JSX.Element; label: string; title?: string; danger?: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-xs disabled:opacity-40 ${
        danger ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border-base-700 text-base-200 hover:bg-base-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/** Bouton sous la zone de saisie : choisir les bibliothèques consultées par la conversation. */
export function KnowledgeButton({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }): JSX.Element {
  const collections = useChatStore((s) => s.kbCollections)
  const setLibraryOpen = useChatStore((s) => s.setLibraryOpen)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const active = selected.filter((id) => collections.some((c) => c.id === id))
  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => (collections.length ? setOpen((v) => !v) : setLibraryOpen(true))}
        title={collections.length ? 'Bibliothèques de documents consultées avant chaque réponse' : 'Créer une bibliothèque de documents'}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition ${
          active.length ? 'bg-accent-500/15 text-accent-400 hover:bg-accent-500/25' : 'text-base-300 hover:bg-base-800 hover:text-base-100'
        }`}
      >
        <Library size={14} />
        {active.length === 1 ? (collections.find((c) => c.id === active[0])?.name ?? 'Bibliothèque') : active.length > 1 ? `${active.length} bibliothèques` : 'Bibliothèque'}
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-30 w-64 rounded-[14px] border border-base-700 bg-base-850 p-1.5 shadow-panel">
          {collections.map((c) => {
            const on = active.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => onChange(on ? active.filter((x) => x !== c.id) : [...active, c.id])}
                className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] text-base-200 hover:bg-base-800"
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent-500 bg-accent-500 text-white' : 'border-base-600'}`}>
                  {on && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-[11px] text-base-500">{c.docs}</span>
              </button>
            )
          })}
          <div className="my-1 h-px bg-base-800" />
          <button
            onClick={() => {
              setOpen(false)
              setLibraryOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] text-base-300 hover:bg-base-800"
          >
            <Pencil size={13} /> Gérer les bibliothèques…
          </button>
        </div>
      )}
    </div>
  )
}
