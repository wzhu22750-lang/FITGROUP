import { Component, ReactNode, ErrorInfo } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-paper p-4">
          <div className="bg-white border-4 border-ink p-8 max-w-sm w-full text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-6xl font-black text-ink mb-4">:(</div>
            <h2 className="text-2xl font-black text-ink uppercase mb-4 tracking-tighter">Something Broke</h2>
            <p className="text-xs font-black text-ink/40 uppercase mb-8">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="w-full bg-ink text-neon py-4 px-6 font-black uppercase text-lg border-4 border-ink shadow-[4px_4px_0px_0px_rgba(223,255,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
