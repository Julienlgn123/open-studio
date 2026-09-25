import { Minus, Square, X } from 'lucide-react'

export default function TitleBar(): JSX.Element {
  return (
    <div className="drag flex h-9 shrink-0 items-center justify-between border-b border-base-800 bg-base-950 px-3">
      <div className="flex items-center gap-2 text-xs font-medium text-base-400">
        <div className="h-2 w-2 rounded-full bg-accent-500" />
        Local IA Studio
      </div>
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={() => window.api.window.minimize()}
          className="rounded p-1.5 text-base-400 hover:bg-base-800 hover:text-base-100"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => window.api.window.maximize()}
          className="rounded p-1.5 text-base-400 hover:bg-base-800 hover:text-base-100"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.api.window.close()}
          className="rounded p-1.5 text-base-400 hover:bg-red-500 hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
