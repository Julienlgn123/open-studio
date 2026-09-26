import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, Check, EyeOff, ListFilter, Pencil, Pin, PinOff, Search, Settings, SquarePen, Trash2, X as XIcon } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import ServersBar from './ServersBar'
import type { Conversation, SearchHit } from '@shared/types'
import { conversationTag, DEFAULT_HIDDEN_TAGS, SOURCE_LABELS, TAG_COLORS } from '@shared/types'

const SEARCH_DELAY_MS = 200

/** Équivalent Tailwind de `.sidebar-item` (Cours Studio / Drive Studio), barre violette si actif. */
function itemClass(active: boolean): string {
  return `group relative flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-[7px] text-[13.5px] transition ${
    active
      ? 'bg-base-100/[0.07] text-base-100 before:absolute before:bottom-[20%] before:left-0 before:top-[20%] before:w-0.5 before:rounded-full before:bg-accent-500'
      : 'text-base-300 hover:bg-base-100/[0.04] hover:text-base-100'
  }`
}
const DAY = 86_400_000

function groupLabel(ts: number): string {
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (ts >= startOfToday) return 'Aujourd’hui'
  if (ts >= startOfToday - DAY) return 'Hier'
  if (ts >= startOfToday - 7 * DAY) return '7 derniers jours'
  if (ts >= startOfToday - 30 * DAY) return '30 derniers jours'
  return 'Plus ancien'
}

function NavRow({
  icon,
  label,
  hint,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  active?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button onClick={onClick} className={itemClass(!!active)}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {hint && <kbd className="font-sans text-[11px] text-base-500 opacity-0 group-hover:opacity-100">{hint}</kbd>}
    </button>
  )
}

export function TagChip({ tag }: { tag: string }): JSX.Element {
  const color = TAG_COLORS[tag] ?? '#a1a1aa'
  return (
    <span
      className="shrink-0 rounded px-1 text-[9.5px] font-semibold tracking-[0.04em]"
      style={{ color, backgroundColor: `${color}26` }}
    >
      {tag}
    </span>
  )
}

/** Menu « quelles conversations afficher » : une case par étiquette présente. */
function TagFilter({
  counts,
  hidden,
  onChange,
  onClose
}: {
  counts: [string, number][]
  hidden: string[]
  onChange: (hidden: string[]) => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div ref={ref} className="absolute right-2 top-7 z-30 w-56 rounded-xl border border-base-700 bg-base-850 p-1.5 shadow-panel">
      <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-base-500">Afficher dans la liste</p>
      {counts.map(([tag, n]) => (
        <label key={tag} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-base-200 hover:bg-base-800">
          <input
            type="checkbox"
            checked={!hidden.includes(tag)}
            onChange={(e) => onChange(e.target.checked ? hidden.filter((t) => t !== tag) : [...hidden, tag])}
            className="accent-accent-500"
          />
          <TagChip tag={tag} />
          <span className="ml-auto text-[11px] text-base-500">{n}</span>
        </label>
      ))}
      <div className="mt-1 flex gap-1 border-t border-base-800 pt-1.5">
        <button onClick={() => onChange([])} className="flex-1 rounded-md px-2 py-1 text-[11.5px] text-base-300 hover:bg-base-800">
          Tout afficher
        </button>
        <button
          onClick={() => onChange(DEFAULT_HIDDEN_TAGS)}
          className="flex-1 rounded-md px-2 py-1 text-[11.5px] text-base-300 hover:bg-base-800"
        >
          Masquer les imports
        </button>
      </div>
      <p className="px-2 pb-1 pt-1.5 text-[10.5px] leading-4 text-base-500">
        Les conversations masquées restent trouvables avec « Rechercher » et par le modèle. Épingle-en une pour la garder visible.
      </p>
    </div>
  )
}

export default function Sidebar(): JSX.Element {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const engineStatus = useChatStore((s) => s.engineStatus)
  const hiddenTags = useChatStore((s) => s.preferences.hiddenTags)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const togglePinned = useChatStore((s) => s.togglePinned)
  const setHiddenTags = useChatStore((s) => s.setHiddenTags)
  const newConversation = useChatStore((s) => s.newConversation)
  const setModelManagerOpen = useChatStore((s) => s.setModelManagerOpen)
  const setPreferencesOpen = useChatStore((s) => s.setPreferencesOpen)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Ctrl+K ouvre la recherche (Ctrl+N est géré dans App).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    let alive = true
    const t = setTimeout(() => {
      window.api.conversations.search(q).then((r) => alive && setHits(r))
    }, SEARCH_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  const closeSearch = (): void => {
    setQuery('')
    setSearchOpen(false)
  }

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of conversations) m.set(conversationTag(c), (m.get(conversationTag(c)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [conversations])

  // Recherche : tout (y compris masqué). Sinon : épinglées toujours visibles, puis le reste filtré par étiquette.
  const { groups, hiddenCount } = useMemo(() => {
    type Item = { conv: Conversation; snippet: string | null }
    if (hits) {
      const byId = new Map(conversations.map((c) => [c.id, c]))
      const items = hits.flatMap((h) => {
        const conv = byId.get(h.conversationId)
        return conv ? [{ conv, snippet: h.snippet }] : []
      })
      return { groups: [{ label: 'Résultats', items }], hiddenCount: 0 }
    }
    const out: { label: string; items: Item[] }[] = []
    const pinned = conversations.filter((c) => c.pinned)
    if (pinned.length) out.push({ label: 'Épinglées', items: pinned.map((conv) => ({ conv, snippet: null })) })
    let hidden = 0
    for (const conv of conversations) {
      if (conv.pinned) continue
      if (hiddenTags.includes(conversationTag(conv)) && conv.id !== activeId) {
        hidden++
        continue
      }
      const label = groupLabel(conv.updatedAt)
      let group = out.find((g) => g.label === label)
      if (!group) out.push((group = { label, items: [] }))
      group.items.push({ conv, snippet: null })
    }
    return { groups: out, hiddenCount: hidden }
  }, [conversations, hits, hiddenTags, activeId])

  const startEdit = (id: string, title: string): void => {
    setConfirmDeleteId(null)
    setEditingId(id)
    setEditValue(title)
  }

  const commitEdit = (id: string): void => {
    if (editValue.trim()) renameConversation(id, editValue.trim())
    setEditingId(null)
  }

  const ollamaOk = engineStatus?.ollama.available

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col border-r border-base-800 bg-base-900">
      <div className="space-y-0.5 px-2 pb-1 pt-3">
        <NavRow icon={<SquarePen size={15} />} label="Nouvelle conversation" hint="Ctrl N" active={!activeId} onClick={newConversation} />
        {searchOpen ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-base-700 bg-base-850 px-2.5 py-[6px] focus-within:border-accent-500">
            <Search size={15} className="shrink-0 text-base-400" />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              placeholder="Rechercher (tout, même masqué)…"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-base-100 outline-none placeholder:text-base-600"
            />
            <button onClick={closeSearch} className="shrink-0 text-base-500 hover:text-base-100">
              <XIcon size={13} />
            </button>
          </div>
        ) : (
          <NavRow icon={<Search size={15} />} label="Rechercher" hint="Ctrl K" onClick={() => setSearchOpen(true)} />
        )}
        <NavRow icon={<Boxes size={15} />} label="Modèles" onClick={() => setModelManagerOpen(true)} />
      </div>

      <div className="relative flex items-center justify-between px-3 pb-0.5 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-500">Conversations</span>
        {conversations.length > 0 && (
          <button
            onClick={() => setFilterOpen((v) => !v)}
            title="Choisir les conversations affichées"
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition ${
              hiddenTags.length ? 'text-accent-400 hover:bg-accent-500/15' : 'text-base-500 hover:bg-base-100/[0.05] hover:text-base-200'
            }`}
          >
            <ListFilter size={12} />
            {hiddenTags.length ? 'Filtré' : 'Filtrer'}
          </button>
        )}
        {filterOpen && (
          <TagFilter counts={tagCounts} hidden={hiddenTags} onChange={setHiddenTags} onClose={() => setFilterOpen(false)} />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <p className="px-2.5 py-6 text-center text-xs text-base-500">Tes conversations apparaîtront ici.</p>
        )}
        {hits && groups[0].items.length === 0 && (
          <p className="px-2.5 py-6 text-center text-xs text-base-500">Aucun résultat.</p>
        )}
        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <div key={g.label} className="mt-3 first:mt-1.5">
              <p className="mb-1 flex items-center gap-1 px-3 text-[10.5px] font-medium text-base-500">
                {g.label === 'Épinglées' && <Pin size={10} />}
                {g.label}
              </p>
              <div className="space-y-px">
                {g.items.map(({ conv: c, snippet }) => {
                  const tag = conversationTag(c)
                  return (
                    <div
                      key={`${g.label}-${c.id}`}
                      onClick={() => editingId !== c.id && selectConversation(c.id)}
                      className={itemClass(c.id === activeId)}
                    >
                      {editingId === c.id ? (
                        <>
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(c.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="min-w-0 flex-1 rounded-md bg-base-850 px-1.5 py-0.5 text-[13.5px] outline-none ring-1 ring-accent-500"
                          />
                          <button onClick={(e) => { e.stopPropagation(); commitEdit(c.id) }} className="shrink-0 text-base-400 hover:text-base-100">
                            <Check size={13} />
                          </button>
                        </>
                      ) : confirmDeleteId === c.id ? (
                        <>
                          <span
                            className="min-w-0 flex-1 truncate text-red-400"
                            title={
                              c.source
                                ? `Retire seulement la copie dans Local IA Studio : la conversation d'origine (${SOURCE_LABELS[c.source]}) n'est pas touchée.`
                                : undefined
                            }
                          >
                            {c.source ? 'Retirer de l’app ?' : 'Supprimer ?'}
                          </span>
                          <button
                            title="Confirmer"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); deleteConversation(c.id) }}
                            className="shrink-0 rounded px-1 text-red-400 hover:bg-red-500/15"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            title="Annuler"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                            className="shrink-0 text-base-400 hover:text-base-100"
                          >
                            <XIcon size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          {isStreaming[c.id] && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-500" />}
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5">
                              <span className="truncate">{c.title}</span>
                              <span className="group-hover:hidden">
                                <TagChip tag={tag} />
                              </span>
                            </p>
                            {snippet && <p className="truncate text-[11px] text-base-500">{snippet}</p>}
                          </div>
                          <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                            <button
                              title={c.pinned ? 'Désépingler' : 'Épingler (toujours affichée)'}
                              onClick={(e) => { e.stopPropagation(); togglePinned(c.id) }}
                              className={c.pinned ? 'text-accent-400 hover:text-base-100' : 'text-base-500 hover:text-base-100'}
                            >
                              {c.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                            </button>
                            <button
                              title="Renommer"
                              onClick={(e) => { e.stopPropagation(); startEdit(c.id, c.title) }}
                              className="text-base-500 hover:text-base-100"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              title={c.source ? 'Retirer de l’app (l’original n’est pas touché)' : 'Supprimer'}
                              onClick={(e) => { e.stopPropagation(); setEditingId(null); setConfirmDeleteId(c.id) }}
                              className="text-base-500 hover:text-red-400"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}
        {!hits && hiddenCount > 0 && (
          <button
            onClick={() => setFilterOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[11.5px] text-base-500 hover:bg-base-100/[0.04] hover:text-base-300"
          >
            <EyeOff size={12} />
            {hiddenCount} conversation{hiddenCount > 1 ? 's' : ''} masquée{hiddenCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="border-t border-base-800 p-2">
        <ServersBar />
        <NavRow icon={<Settings size={15} />} label="Préférences" onClick={() => setPreferencesOpen(true)} />
        <button
          onClick={() => setModelManagerOpen(true)}
          className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-base-500 hover:text-base-300"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${ollamaOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {ollamaOk ? `Ollama connecté${engineStatus?.ollama.version ? ` · v${engineStatus.ollama.version}` : ''}` : 'Ollama non détecté · moteur embarqué dispo'}
        </button>
      </div>
    </div>
  )
}
