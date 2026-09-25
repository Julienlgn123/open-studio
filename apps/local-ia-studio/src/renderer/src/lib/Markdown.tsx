import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? 'text'
  const text = String(children ?? '').replace(/\n$/, '')

  return (
    <div className="relative">
      <div className="flex items-center justify-between border-b border-base-700 bg-base-850 px-3 py-1.5 text-[11px] uppercase tracking-wide text-base-400">
        <span>{lang}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-base-400 hover:bg-base-700 hover:text-base-100"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="!my-0 !rounded-t-none">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

export default function Markdown({ content }: { content: string }): JSX.Element {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: (props) => {
            const { className, children } = props as { className?: string; children?: React.ReactNode }
            const isBlock = /language-/.test(className ?? '')
            if (!isBlock) {
              return <code className={className}>{children}</code>
            }
            return <CodeBlock className={className}>{children}</CodeBlock>
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
