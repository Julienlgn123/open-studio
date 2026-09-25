import { useEffect, useRef } from 'react'
import { SlidersHorizontal, Sparkles } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import MessageBubble from './MessageBubble'
import Composer from './Composer'
import ModelPicker from './ModelPicker'
import Markdown from '../lib/Markdown'
import type { ChatMessage } from '@shared/types'

const EMPTY_MESSAGES: ChatMessage[] = []

export default function ChatView(): JSX.Element {
  const activeId = useChatStore((s) => s.activeId)
  const conversations = useChatStore((s) => s.conversations)
  const messages = useChatStore((s) => (activeId ? (s.messages[activeId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES))
  const streamingText = useChatStore((s) => (activeId ? (s.streamingText[activeId] ?? '') : ''))
  const isStreaming = useChatStore((s) => (activeId ? !!s.isStreaming[activeId] : false))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const switchModel = useChatStore((s) => s.switchModel)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const scrollRef = useRef<HTMLDivElement>(null)

  const conv = conversations.find((c) => c.id === activeId)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, streamingText])

  if (!activeId || !conv) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-base-500">
        <Sparkles size={32} className="text-accent-500" />
        <p className="text-sm">Crée une nouvelle conversation pour commencer.</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-base-800 px-4">
        <ModelPicker engine={conv.engine} model={conv.model} onChange={(engine, model) => switchModel(conv.id, engine, model)} />
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-base-700 px-2.5 py-1.5 text-sm text-base-300 hover:bg-base-800"
        >
          <SlidersHorizontal size={13} />
          Réglages
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 && !streamingText && (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-base-500">
              <Sparkles size={28} className="text-accent-500" />
              <p className="text-sm">Envoie un message pour démarrer la conversation.</p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          {isStreaming && (
            <div className="flex gap-3 bg-base-900/40 px-4 py-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white">
                <Sparkles size={13} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                {streamingText ? (
                  <Markdown content={streamingText} />
                ) : (
                  <div className="flex gap-1 py-1.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-base-500 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-base-500 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-base-500" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Composer
        disabled={!conv.model}
        isStreaming={isStreaming}
        onSend={(text) => sendMessage(text)}
        onStop={() => stopStreaming(conv.id)}
      />
    </div>
  )
}
