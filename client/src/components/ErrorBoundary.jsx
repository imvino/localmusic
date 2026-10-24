import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

// Route-level crash guard — a flaky upstream API or a bad render path
// should take down one view, not the whole app
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    // Recover when the route changes — don't trap the user on the error screen
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      // Player chrome (seekbar, queue, fullscreen) — a render crash hides the
      // UI but must never kill playback; recover on the next route change.
      if (this.props.silent) return null
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-8 gap-3">
          <AlertTriangle size={40} className="text-zinc-600" />
          <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
          <p className="text-sm text-zinc-500 max-w-md">{this.state.error.message || 'Unexpected error'}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-full transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
