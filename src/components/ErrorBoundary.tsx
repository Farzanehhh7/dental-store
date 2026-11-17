import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'خطای غیرمنتظره رخ داد.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-paper dark:bg-slate-950 flex items-center justify-center p-6" dir="rtl">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-xl p-8 space-y-4">
            <h1 className="text-xl font-extrabold text-ink dark:text-slate-100">بروز خطا در بارگذاری صفحه</h1>
            <p className="text-sm text-ink/70 dark:text-slate-400 leading-relaxed">
              در ارتباط با سرویس یا پردازش اطلاعات مشکلی پیش آمد. می‌توانید صفحه را مجدداً بارگذاری کنید.
            </p>
            <pre className="text-xs bg-surface dark:bg-slate-950 p-3 rounded border border-line dark:border-slate-800 overflow-x-auto text-left" dir="ltr">
              {this.state.errorMessage}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brandDark transition-colors"
            >
              بارگذاری مجدد
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
