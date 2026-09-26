import type { WebContents } from 'electron'
import { addMessage, createConversation, getPreferences, updateConversation } from './db'
import { runAttempt } from './agent'
import { getMistralKey } from './secrets'
import { autoTitle } from '@shared/types'
import type { CompareResult, ConversationSettings, EngineKind } from '@shared/types'

// Comparaison de deux modèles sur la même question, côte à côte. Rien n'est enregistré tant
// que l'utilisateur ne choisit pas « Continuer avec cette réponse ».

const running = new Map<string, AbortController>()

export async function runCompare(
  sender: WebContents,
  slot: string,
  target: { engine: EngineKind; model: string },
  prompt: string
): Promise<CompareResult> {
  running.get(slot)?.abort()
  const controller = new AbortController()
  running.set(slot, controller)
  const settings: ConversationSettings = { ...getPreferences().defaultSettings, fileAccess: false }
  const started = Date.now()
  let firstToken: number | null = null
  let text = ''
  try {
    await runAttempt(
      target.engine,
      target.model,
      [{ role: 'user', content: prompt }],
      settings,
      {
        onToken: (chunk) => {
          firstToken ??= Date.now()
          text += chunk
          if (!sender.isDestroyed()) sender.send(`compare:chunk:${slot}`, chunk)
        },
        onTool: () => {},
        onApproval: async () => 'deny'
      },
      controller.signal,
      getMistralKey(),
      'read'
    )
    return { text, ms: Date.now() - started, firstTokenMs: firstToken ? firstToken - started : null, error: null, stopped: false }
  } catch (err) {
    const stopped = controller.signal.aborted
    return {
      text,
      ms: Date.now() - started,
      firstTokenMs: firstToken ? firstToken - started : null,
      error: stopped ? null : err instanceof Error ? err.message : String(err),
      stopped
    }
  } finally {
    if (running.get(slot) === controller) running.delete(slot)
  }
}

export function cancelCompare(slot: string): void {
  running.get(slot)?.abort()
}

/** « Continuer avec cette réponse » : devient une vraie conversation avec ce modèle. */
export function keepCompare(target: { engine: EngineKind; model: string }, prompt: string, answer: string): string {
  const conv = createConversation(target.engine, target.model)
  updateConversation(conv.id, { title: autoTitle(prompt) })
  addMessage(conv.id, 'user', prompt)
  addMessage(conv.id, 'assistant', answer)
  return conv.id
}
