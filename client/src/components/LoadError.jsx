import React from 'react';

// 데이터 로딩 실패 시 표시하는 공용 에러 상태. 재시도 버튼을 제공한다.
// error 는 ApiError 이거나 일반 Error 일 수 있다.
export default function LoadError({ error, onRetry }) {
  const message = (error && error.message) || '데이터를 불러오지 못했습니다.';
  return (
    <div className="text-center py-10 space-y-3">
      <p className="text-sm text-loss-text">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-brand-text hover:text-brand-text border border-line hover:bg-surface-page rounded-control px-4 py-2 transition-colors"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
