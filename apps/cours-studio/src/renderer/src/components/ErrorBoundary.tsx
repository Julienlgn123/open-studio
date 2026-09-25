import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional reset key — when it changes, the boundary clears its error state */
  resetKey?: unknown
  onReset?: () => void
}

interface State {
  error: Error | null
  info: string
}

// Without this, any throw during render in a child (e.g. a broken editor
// extension) unmounts the whole tree and leaves a blank window.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: '' })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('UI error:', error, info)
    this.setState({ info: info.componentStack ?? '' })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>😵</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Une erreur est survenue dans cette vue</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Tes données ne sont pas touchées. Reviens à l'accueil ou redémarre l'application.
          </div>
          <pre style={{
            textAlign: 'left', fontSize: 11, lineHeight: 1.5, color: 'var(--danger)',
            background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            padding: '10px 12px', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', marginBottom: 16
          }}>
            {this.state.error.message}
            {this.state.info ? `\n${this.state.info.split('\n').slice(0, 6).join('\n')}` : ''}
          </pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { this.setState({ error: null, info: '' }); this.props.onReset?.() }}
            >
              Retour à l'accueil
            </button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Recharger
            </button>
          </div>
        </div>
      </div>
    )
  }
}
