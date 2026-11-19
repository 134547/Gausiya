import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[App ErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#171717]">Something Went Wrong</h1>
              <p className="text-xs text-[#737373] mt-1.5 leading-relaxed">
                {this.state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Portal</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
