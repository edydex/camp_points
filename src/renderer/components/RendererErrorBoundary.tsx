import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RendererErrorBoundaryProps {
  children: ReactNode
  surface: 'Presenter' | 'Stage'
}

interface RendererErrorBoundaryState {
  error: string | null
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): RendererErrorBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`${this.props.surface} renderer failed`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="renderer-failure" role="alert">
        <p>Launch system fault</p>
        <h1>{this.props.surface} could not finish loading.</h1>
        <p>The show data is still safe. Reload this window; if the problem returns, copy the detail below.</p>
        <code>{this.state.error}</code>
        <button type="button" onClick={() => window.location.reload()}>Reload {this.props.surface}</button>
      </main>
    )
  }
}
