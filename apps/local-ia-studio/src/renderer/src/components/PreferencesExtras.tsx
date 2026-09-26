import { useEffect, useState } from 'react'
import { CircleCheck, FolderPlus, Loader2, MessagesSquare, Trash2, Upload } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import type { AppPreferences, ImportResult, WriteMode } from '@shared/types'

type Kind = 'code' | 'ai' | 'chatgpt' | 'codex'

/** Dossiers que le modèle peut lire (enregistrés tout de suite, hors du bouton « Enregistrer »). */
const WRITE_MODES: { value: WriteMode; label: string; hint: string }[] = [
  { value: 'read', label: 'Lecture seule', hint: 'le modèle lit et propose, tu appliques toi-même' },
  { value: 'ask', label: 'Agir avec mon accord', hint: 'chaque création / modification / suppression t’est montrée avant (ou « Tout autoriser » pour une tâche)' },
  { value: 'auto', label: 'Autonome', hint: 'le modèle fait tout seul, comme un agent (originaux sauvegardés, suppressions à la corbeille)' }
]

export function WorkspaceSection({
  writeMode,
  onWriteModeChange,
  fileAccessDefault,
  onDefaultChange,
  onRootsChange
}: {
  writeMode: WriteMode
  onWriteModeChange: (v: WriteMode) => void
  fileAccessDefault: boolean
  onDefaultChange: (v: boolean) => void
  onRootsChange: (prefs: AppPreferences) => void
}): JSX.Element {
  const roots = useChatStore((s) => s.preferences.workspaceRoots)

  return (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-base-500">
        Quand le bouton « Fichiers » est actif, le modèle peut explorer ces dossiers, comprendre tes projets et — si tu
        l’autorises ci-dessous — créer, modifier, déplacer ou supprimer des fichiers. Rien en dehors de ces dossiers.
        node_modules, .git, dist… sont ignorés.
      </p>
      {roots.map((r) => (
        <div key={r} className="flex items-center justify-between gap-2 rounded-[10px] border border-base-800 bg-base-900 px-3 py-2">
          <span className="truncate font-mono text-xs text-base-200" title={r}>
            {r}
          </span>
          <button
            onClick={async () => onRootsChange(await window.api.workspace.removeRoot(r))}
            className="shrink-0 text-base-500 hover:text-red-400"
            title="Retirer l’accès"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={async () => onRootsChange(await window.api.workspace.addRoot())}
          className="flex items-center gap-1.5 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100"
        >
          <FolderPlus size={13} />
          Autoriser un dossier…
        </button>
        {roots.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-base-300">
            <input
              type="checkbox"
              checked={fileAccessDefault}
              onChange={(e) => onDefaultChange(e.target.checked)}
              className="accent-accent-500"
            />
            Actif par défaut
          </label>
        )}
      </div>
      <div className="space-y-1 pt-1">
        {WRITE_MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2 transition ${
              writeMode === m.value ? 'border-accent-500/50 bg-accent-500/10' : 'border-base-800 hover:bg-base-850'
            }`}
          >
            <input
              type="radio"
              name="writeMode"
              checked={writeMode === m.value}
              onChange={() => onWriteModeChange(m.value)}
              className="mt-0.5 accent-accent-500"
            />
            <span className="text-xs">
              <span className="text-base-100">{m.label}</span>
              <span className="block text-base-500">{m.hint}</span>
            </span>
          </label>
        ))}
        {writeMode !== 'read' && (
          <p className="pt-1 text-[11px] leading-4 text-base-600">
            Les fichiers modifiés sont d’abord copiés dans le dossier « sauvegardes » de l’app ; les suppressions vont à la
            corbeille.
          </p>
        )}
      </div>
    </div>
  )
}

function ResultLine({ r }: { r: ImportResult }): JSX.Element {
  return (
    <p className="flex items-center gap-1.5 text-xs text-emerald-400">
      <CircleCheck size={13} />
      {r.imported} conversation{r.imported > 1 ? 's' : ''} importée{r.imported > 1 ? 's' : ''} ({r.messages} messages)
      {r.skipped > 0 && <span className="text-base-500">· {r.skipped} déjà présente{r.skipped > 1 ? 's' : ''} ou vide{r.skipped > 1 ? 's' : ''}</span>}
    </p>
  )
}

/** Import des conversations Claude, ChatGPT et Codex (fichiers d'origine jamais modifiés). */
export function ImportSection(): JSX.Element {
  const conversations = useChatStore((s) => s.conversations)
  const [count, setCount] = useState<number | null>(null)
  const [codexCount, setCodexCount] = useState<number | null>(null)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const imported = conversations.filter((c) => c.source).length

  useEffect(() => {
    window.api.imports.claudeCodeCount().then(setCount).catch(() => setCount(0))
    window.api.imports.codexCount().then(setCodexCount).catch(() => setCodexCount(0))
  }, [])

  const run = async (kind: Kind): Promise<void> => {
    setBusy(kind)
    setError(null)
    setResult(null)
    try {
      const store = useChatStore.getState()
      // Modèle associé aux conversations importées, pour pouvoir les continuer ensuite.
      const target = store.draftModel() ?? { engine: 'ollama' as const, model: '' }
      const r =
        kind === 'code'
          ? await window.api.imports.claudeCode(target)
          : kind === 'ai'
            ? await window.api.imports.claudeAi(target)
            : kind === 'chatgpt'
              ? await window.api.imports.chatgpt(target)
              : await window.api.imports.codex(target)
      if (r) {
        setResult(r)
        useChatStore.setState({ conversations: await window.api.conversations.list() })
      }
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^.*?Error: /, ''))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-base-500">
        Tes anciennes conversations deviennent consultables ici, et le modèle peut les retrouver (bouton « Fichiers » actif).
        Elles sont masquées de la liste par défaut (filtre « Conversations »). Les fichiers d’origine ne sont jamais modifiés :
        retirer une conversation de l’app ne la supprime pas chez Claude, ChatGPT ou Codex.
        {imported > 0 && ` ${imported} déjà importée${imported > 1 ? 's' : ''}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run('code')}
          disabled={!!busy || !count}
          className="flex items-center gap-1.5 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100 disabled:opacity-40"
        >
          {busy === 'code' ? <Loader2 size={13} className="animate-spin" /> : <MessagesSquare size={13} />}
          Claude Code{count !== null ? ` · ${count} session${count > 1 ? 's' : ''} sur ce PC` : ''}
        </button>
        <button
          onClick={() => run('ai')}
          disabled={!!busy}
          title="claude.ai → Paramètres → Confidentialité → Exporter les données, puis choisis le .zip reçu par e-mail"
          className="flex items-center gap-1.5 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100 disabled:opacity-40"
        >
          {busy === 'ai' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Export claude.ai (.zip)…
        </button>
        <button
          onClick={() => run('chatgpt')}
          disabled={!!busy}
          title="chatgpt.com → Paramètres → Contrôle des données → Exporter les données, puis choisis le .zip reçu par e-mail"
          className="flex items-center gap-1.5 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100 disabled:opacity-40"
        >
          {busy === 'chatgpt' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Export ChatGPT (.zip)…
        </button>
        <button
          onClick={() => run('codex')}
          disabled={!!busy || !codexCount}
          title={codexCount ? 'Sessions Codex trouvées dans ~/.codex/sessions' : 'Aucune session Codex trouvée sur ce PC (~/.codex/sessions)'}
          className="flex items-center gap-1.5 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100 disabled:opacity-40"
        >
          {busy === 'codex' ? <Loader2 size={13} className="animate-spin" /> : <MessagesSquare size={13} />}
          Codex{codexCount !== null ? ` · ${codexCount} session${codexCount > 1 ? 's' : ''}` : ''}
        </button>
      </div>
      {result && <ResultLine r={result} />}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[11px] leading-4 text-base-600">
        Exports : claude.ai → Paramètres → Confidentialité ; ChatGPT → Paramètres → Contrôle des données (lien reçu par
        e-mail). Un nouvel import n’ajoute que les nouvelles conversations, et jamais celles que tu as retirées.
      </p>
    </div>
  )
}
