import { Component } from 'react';

/**
 * ErrorBoundary — captura erros de renderização e exibe mensagem amigável
 * em vez de tela branca. Nunca deixa o app crashar silenciosamente.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Erro de renderização:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <div>
            <p className="text-base font-semibold text-red-800">Ocorreu um erro inesperado</p>
            <p className="mt-1 text-sm text-red-600">
              {this.state.error?.message || 'Erro desconhecido. Tente recarregar a página.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-xl border border-red-300 bg-slate-900/60 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
