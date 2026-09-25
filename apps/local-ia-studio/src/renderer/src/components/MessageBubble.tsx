import { Bot, User } from 'lucide-react'
import Markdown from '../lib/Markdown'

export default function MessageBubble({
  role,
  content
}: {
  role: 'user' | 'assistant' | 'system'
  content: string
}): JSX.Element {
  const isUser = role === 'user'
  return (
    <div className={`flex gap-3 px-4 py-4 ${isUser ? '' : 'bg-base-900/40'}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-base-700 text-base-200' : 'bg-accent-500 text-white'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {isUser ? (
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-base-100">{content}</p>
        ) : (
          <Markdown content={content} />
        )}
      </div>
    </div>
  )
}
