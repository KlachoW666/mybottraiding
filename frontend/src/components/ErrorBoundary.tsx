import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-8"
          style={{ background: '#242424', color: '#fff' }}
        >
          <h1 className="text-xl font-bold mb-4">Ошибка приложения</h1>
          <pre className="text-sm text-red-400 mb-6 max-w-2xl overflow-auto p-4 rounded bg-black/40">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-lg font-medium"
            style={{ background: '#57CA7A', color: '#fff' }}
          >
            Закрыть
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
