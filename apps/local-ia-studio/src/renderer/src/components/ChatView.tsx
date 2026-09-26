import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, CircleAlert, Cloud, Cpu, Download, RefreshCw, Server, SlidersHorizontal } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import MessageBubble from './MessageBubble'
import Composer from './Composer'
import ModelPicker from './ModelPicker'
import Markdown from '../lib/Markdown'
import LogoMark from './LogoMark'
import WelcomeView from './WelcomeView'
import ToolTrail from './ToolTrail'
import ApprovalCard from './ApprovalCard'
import type { ChatMessage, ExportFormat } from '@shared/types'
import { ENGINE_LABELS } from '@shared/types'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TOOLS: string[] = []
/** Distance au bas (px) en dessous de laquelle on continue de suivre la génération. */
const STICK_THRESHOLD = 80

function HeaderButton({
  onClick,
  title,
  children
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-[10px] px-1.5 text-base-300 transition hover:bg-base-100/[0.04] hover:text-base-100"
    >
      {children}
    </button>
  )
}

function ExportMenu({ conversationId }: { conversationId: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const run = async (format: ExportFormat): Promise<void> => {
    setOpen(false)
    const path = await window.api.conversations.export(conversationId, format)
    if (path) {
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    }
  }

  return (
    <div ref={ref} className="relative">
      <HeaderButton onClick={() => setOpen((v) => !v)} title="Exporter la conversation">
        <Download size={15} />
        {done && <span className="text-xs">Exporté</span>}
      </HeaderButton>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-base-700 bg-base-850 p-1 shadow-panel">
          <button onClick={() => run('markdown')} className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-base-200 hover:bg-base-800">
            Markdown (.md)
          </button>
          <button onClick={() => run('json')} className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-base-200 hover:bg-base-800">
            JSON (.json)
          </button>
        </div>
      )}
    </div>
  )
}

export default function ChatView(): JSX.Element {
  const activeId = useChatStore((s) => s.activeId)
  const conversations = useChatStore((s) => s.conversations)
  const messages = useChatStore((s) => (activeId ? (s.messages[activeId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES))
  const streamingText = useChatStore((s) => (activeId ? (s.streamingText[activeId] ?? '') : ''))
  const isStreaming = useChatStore((s) => (activeId ? !!s.isStreaming[activeId] : false))
  const error = useChatStore((s) => (activeId ? (s.errors[activeId] ?? null) : null))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const regenerate = useChatStore((s) => s.regenerate)
  const editMessage = useChatStore((s) => s.editMessage)
  const retry = useChatStore((s) => s.retry)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const switchModel = useChatStore((s) => s.switchModel)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const setPreferencesOpen = useChatStore((s) => s.setPreferencesOpen)
  const updateConversationSettings = useChatStore((s) => s.updateConversationSettings)
  const workspaceRoots = useChatStore((s) => s.preferences.workspaceRoots)
  const streamingTools = useChatStore((s) => (activeId ? (s.streamingTools[activeId] ?? EMPTY_TOOLS) : EMPTY_TOOLS))
  const pendingApproval = useChatStore((s) => (activeId ? (s.pendingApprovals[activeId] ?? null) : null))
  const answerApproval = useChatStore((s) => s.answerApproval)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const conv = conversations.find((c) => c.id === activeId)

  // Nouvelle conversation affichée : on repart en bas.
  useLayoutEffect(() => {
    stickToBottom.current = true
    setShowJump(false)
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [activeId])

  // Pendant la génération, on ne suit le texte que si l'utilisateur n'est pas remonté lire plus haut.
  useLayoutEffect(() => {
    if (stickToBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, streamingText, error])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
    stickToBottom.current = atBottom
    setShowJump(!atBottom)
  }

  if (!activeId || !conv) return <WelcomeView />

  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf('assistant')
  const lastIsUser = messages[messages.length - 1]?.role === 'user'

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-base-800 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="truncate text-[15px] font-semibold text-base-100">{conv.title}</h2>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-base-800 px-2 py-0.5 text-[11.5px] font-medium text-base-300">
            {conv.engine === 'ollama' ? <Server size={10} /> : conv.engine === 'mistral' ? <Cloud size={10} /> : <Cpu size={10} />}
            {ENGINE_LABELS[conv.engine]}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && <ExportMenu conversationId={conv.id} />}
          <HeaderButton onClick={() => setSettingsOpen(true)} title="Réglages de la conversation">
            <SlidersHorizontal size={15} />
          </HeaderButton>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl pb-8">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                canAct={!isStreaming && !m.id.startsWith('pending-')}
                canRegenerate={m.role === 'assistant' && i === lastAssistantIndex && !isStreaming}
                onRegenerate={() => regenerate(m.id)}
                onEdit={(content) => editMessage(m.id, content)}
                onDelete={() => deleteMessage(conv.id, m.id)}
              />
            ))}
            {isStreaming && (
              <div className="flex gap-3.5 px-4 pt-6">
                <div className="mt-0.5 shrink-0">
                  <LogoMark size={24} />
                </div>
                <div className="selectable min-w-0 flex-1 pt-px">
                  {streamingTools.length > 0 && <ToolTrail items={streamingTools} live />}
                  {streamingText && <Markdown content={streamingText} />}
                  {pendingApproval && activeId ? (
                    <ApprovalCard approval={pendingApproval} onAnswer={(d) => answerApproval(activeId, d)} />
                  ) : streamingText ? null : (
                    <div className="flex items-center gap-2 py-1.5 text-[13px] text-base-500">
                      <span className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" />
                      </span>
                      {streamingTools.length ? 'Exploration…' : 'Réflexion…'}
                    </div>
                  )}
                </div>
              </div>
            )}
            {error && !isStreaming && (
              <div className="mx-4 mt-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-400">
                <CircleAlert size={15} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1 break-words">{error}</p>
                {lastIsUser && (
                  <button
                    onClick={() => retry(conv.id)}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs hover:bg-red-500/15"
                  >
                    <RefreshCw size={12} />
                    Réessayer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {showJump && (
          <button
            onClick={() => {
              stickToBottom.current = true
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            }}
            className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-base-700 bg-base-850 text-base-300 shadow-panel hover:text-base-100"
            title="Aller en bas"
          >
            <ArrowDown size={15} />
          </button>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-2">
        <Composer
          disabled={!conv.model}
          isStreaming={isStreaming}
          engine={conv.engine}
          placeholder="Réponds…"
          onSend={(text, attachments) => {
            stickToBottom.current = true
            sendMessage(text, attachments)
          }}
          onStop={() => stopStreaming(conv.id)}
          fileAccess={{
            on: conv.settings.fileAccess,
            configured: workspaceRoots.length > 0,
            onToggle: () =>
              workspaceRoots.length
                ? updateConversationSettings(conv.id, { ...conv.settings, fileAccess: !conv.settings.fileAccess })
                : setPreferencesOpen(true)
          }}
          toolbar={
            <ModelPicker
              variant="ghost"
              placement="up"
              engine={conv.engine}
              model={conv.model}
              onChange={(engine, model) => switchModel(conv.id, engine, model)}
            />
          }
        />
      </div>
    </div>
  )
}
