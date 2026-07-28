import React from 'react';

// FND-15(감사): 하위 컴포넌트의 렌더 예외를 잡는 경계가 전혀 없어 렌더 중 던져진
// 예외가 앱 전체를 백지로 만들었다. 에러 바운더리는 클래스 컴포넌트로만 구현 가능하다.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-muted">
          <div className="text-center py-10 space-y-3 max-w-sm">
            <p className="text-sm text-expense">문제가 발생해 화면을 표시할 수 없습니다.</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-accent hover:text-accent-strong border border-line hover:bg-surface-muted rounded-lg px-4 py-2 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
