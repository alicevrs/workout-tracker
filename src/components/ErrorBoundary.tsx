import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="banner error mt" role="alert">
          <div className="grow">
            <strong>Something went wrong on this screen.</strong>
            <div className="small">{this.state.error.message}</div>
            <div className="small muted">Your data is safe. Reloading usually fixes this.</div>
          </div>
          <button className="btn small" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
