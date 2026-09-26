import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import ModelPicker from './ModelPicker'
import SettingsFields, { Field, useContextMax } from './SettingsFields'
import MistralKeyForm from './MistralKeyForm'
import { ImportSection, WorkspaceSection } from './PreferencesExtras'
import type { AppPreferences } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export default function PreferencesPanel(): JSX.Element | null {
  const open = useChatStore((s) => s.preferencesOpen)
  const setOpen = useChatStore((s) => s.setPreferencesOpen)
  const preferences = useChatStore((s) => s.preferences)
  const savePreferences = useChatStore((s) => s.savePreferences)

  const [draft, setDraft] = useState<AppPreferences>(preferences)
  const contextMax = useContextMax(open ? draft.defaultEngine : null, open ? draft.defaultModel : null)

  useEffect(() => {
    if (open) setDraft(preferences)
  }, [open])

  if (!open) return null

  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[30rem] max-w-full flex-col overflow-hidden rounded-[20px] border border-base-700 bg-base-850 shadow-panel"
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-[17px] font-semibold text-base-100">Préférences</h2>
          <button onClick={() => setOpen(false)} className="text-base-400 hover:text-base-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-4">
          <p className="text-xs text-base-500">
            Ces réglages s’appliquent aux <strong className="text-base-300">nouvelles</strong> conversations. Chaque
            conversation garde ensuite ses propres réglages.
          </p>

          <Field label="Ton prénom" hint="affiché sur l’accueil">
            <input
              value={draft.userName}
              onChange={(e) => setDraft((d) => ({ ...d, userName: e.target.value }))}
              placeholder="Ex : Julien"
              className="w-full rounded-[10px] border border-base-800 bg-base-900 px-3 py-[9px] text-sm text-base-100 outline-none placeholder:text-base-600 focus:border-accent-500"
            />
          </Field>

          <Field label="Mistral · cloud" hint="IA prête à l’emploi + conseiller">
            <MistralKeyForm />
          </Field>

          <Field label="Accès aux fichiers" hint="tes projets">
            <WorkspaceSection
              writeMode={draft.writeMode}
              onWriteModeChange={(writeMode) => setDraft((d) => ({ ...d, writeMode }))}
              fileAccessDefault={draft.defaultSettings.fileAccess}
              onDefaultChange={(v) => setDraft((d) => ({ ...d, defaultSettings: { ...d.defaultSettings, fileAccess: v } }))}
              onRootsChange={(saved) => {
                // Les dossiers sont enregistrés tout de suite : on reporte seulement cette partie.
                useChatStore.setState((st) => ({ preferences: { ...st.preferences, workspaceRoots: saved.workspaceRoots } }))
                setDraft((d) => ({ ...d, workspaceRoots: saved.workspaceRoots }))
              }}
            />
          </Field>

          <Field label="Anciennes conversations" hint="Claude · ChatGPT · Codex">
            <ImportSection />
          </Field>

          <Field label="Modèle par défaut">
            <ModelPicker
              engine={draft.defaultEngine ?? 'ollama'}
              model={draft.defaultModel ?? ''}
              onChange={(engine, model) => setDraft((d) => ({ ...d, defaultEngine: engine, defaultModel: model }))}
            />
          </Field>

          <SettingsFields
            value={draft.defaultSettings}
            onChange={(patch) => setDraft((d) => ({ ...d, defaultSettings: { ...d.defaultSettings, ...patch } }))}
            contextMax={contextMax}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-6 pb-6 pt-2">
          <button
            onClick={() => setDraft((d) => ({ ...d, defaultSettings: { ...DEFAULT_SETTINGS, fileAccess: d.defaultSettings.fileAccess } }))}
            className="rounded-lg px-3 py-1.5 text-xs text-base-400 hover:bg-base-800 hover:text-base-200"
          >
            Réinitialiser les réglages
          </button>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="rounded-[10px] border border-base-800 bg-base-850 px-3.5 py-[7px] text-[13.5px] text-base-300 hover:bg-base-800 hover:text-base-100">
              Annuler
            </button>
            <button
              disabled={!dirty}
              onClick={async () => {
                await savePreferences(draft)
                setOpen(false)
              }}
              className="rounded-[10px] bg-accent-500 px-3.5 py-[7px] text-[13.5px] font-medium text-white enabled:hover:bg-accent-400 disabled:opacity-30"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
