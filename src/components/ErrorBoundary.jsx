import * as Sentry from '@sentry/react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Component } from 'react';
import { logError } from '../services/loggerService';
import { notifyCenter } from '../services/notificationCenterService';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Encaminha o erro ao Sentry com component stack completo.
    // Este e o ponto correto para captura de erros de render no React.
    Sentry.captureException(error, {
      contexts: {
        react: { component_stack: info?.componentStack || '' },
      },
      tags: {
        boundary: this.props.name || 'global-boundary',
      },
    });

    logError('ui', 'render_boundary_caught', error, {
      component_stack: info?.componentStack || '',
      boundary: this.props.name || 'global-boundary',
    });

    notifyCenter({
      type: 'error',
      title: 'Erro inesperado na interface',
      message: error?.message || 'A interface encontrou um erro inesperado e exibiu um fallback seguro.',
      sticky: true,
      metadata: {
        boundary: this.props.name || 'global-boundary',
      },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="surface-card flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-[28px] p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/30 bg-red-500/10 text-red-200">
            <AlertTriangle size={28} />
          </div>
          <div className="max-w-xl">
            <p className="text-lg font-semibold text-slate-50">Ocorreu um erro inesperado nesta tela</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {this.state.error?.message || 'Erro desconhecido. O fallback seguro foi ativado para preservar a operacao do NC Finance.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn-brand inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            <RefreshCcw size={15} />
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
