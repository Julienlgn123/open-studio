import { basename } from 'path'
import type { ChatMessage, Conversation, ExportFormat } from '@shared/types'

const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  system: 'Système',
  user: 'Toi',
  assistant: 'Assistant'
}

function modelLabel(conv: Conversation): string {
  return conv.engine === 'llamacpp' ? basename(conv.model) : conv.engine === 'mistral' ? `${conv.model} (Mistral, cloud)` : conv.model
}

export function exportFileName(title: string, format: ExportFormat): string {
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 80) || 'conversation'
  return `${safe}.${format === 'markdown' ? 'md' : 'json'}`
}

export function conversationToMarkdown(conv: Conversation, messages: ChatMessage[]): string {
  const lines = [
    `# ${conv.title}`,
    '',
    `> Modèle : ${modelLabel(conv)} · Exporté le ${new Date().toLocaleString('fr-FR')}`,
    ''
  ]
  if (conv.settings.systemPrompt.trim()) {
    lines.push(`**${ROLE_LABELS.system}** : ${conv.settings.systemPrompt.trim()}`, '')
  }
  for (const m of messages) {
    lines.push(`## ${ROLE_LABELS[m.role]}`, '')
    if (m.attachments?.length) lines.push(`*Pièces jointes : ${m.attachments.map((a) => a.name).join(', ')}*`, '')
    lines.push(m.content, '')
  }
  return lines.join('\n')
}

export function conversationToJson(conv: Conversation, messages: ChatMessage[]): string {
  return JSON.stringify(
    {
      title: conv.title,
      engine: conv.engine,
      model: modelLabel(conv),
      settings: conv.settings,
      createdAt: new Date(conv.createdAt).toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        createdAt: new Date(m.createdAt).toISOString()
      }))
    },
    null,
    2
  )
}
