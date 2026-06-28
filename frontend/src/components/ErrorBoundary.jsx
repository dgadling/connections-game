import { Component } from 'react'
import toast from 'react-hot-toast'

export class ErrorBoundary extends Component {
  constructor(p){ super(p); this.state = { err: null } }
  static getDerivedStateFromError(err){ return { err } }
  componentDidCatch(err, info){ console.error('💥 React crash:', err, info.componentStack); toast.error('Something crashed – see details below') }
  render(){
    if (this.state.err) {
      return <div className="p-4 bg-danger-subtle border border-danger-strong rounded-xl text-sm max-w-2xl mx-auto my-8">
        <div className="font-bold text-danger-strong mb-2">Something went wrong</div>
        <pre className="whitespace-pre-wrap text-xs text-danger-strong/80">{String(this.state.err.message || this.state.err)}</pre>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={()=>this.setState({err:null})} className="px-3 py-1.5 bg-surface border border-danger-strong rounded text-xs hover:bg-danger-subtle">Try again</button>
          <button type="button" onClick={()=>window.location.reload()} className="px-3 py-1.5 bg-danger text-white rounded text-xs hover:bg-danger-hover">Reload page</button>
        </div>
      </div>
    }
    return this.props.children
  }
}
