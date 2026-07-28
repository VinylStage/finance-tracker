import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// window.confirm / window.alert 을 대체하는 앱 스타일 모달.
//
// useConfirm() 은 { confirm, alert } 를 반환한다. 둘 다 Promise 를 반환하므로
// 기존 동기 코드를 최소 변경으로 옮길 수 있다:
//   if (!confirm(msg))        →  if (!await confirm(msg))
//   alert(msg)                →  await alert(msg)
//
// confirm(message, options?) → Promise<boolean>  (options: { tone, confirmLabel, cancelLabel })
// alert(message, options?)   → Promise<void>      (options: { tone, confirmLabel })

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  // 다이얼로그를 닫고 대기 중인 Promise 를 해소한다.
  const settle = useCallback((value) => {
    setDialog(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    if (resolve) resolve(value);
  }, []);

  const request = useCallback((config) => new Promise((resolve) => {
    // 이전 다이얼로그가 열려 있으면 취소 값으로 정리한 뒤 새 것을 연다.
    if (resolverRef.current) resolverRef.current(config.kind === 'alert' ? undefined : false);
    resolverRef.current = resolve;
    setDialog(config);
  }), []);

  const value = useMemo(() => ({
    confirm: (message, options = {}) => request({
      kind: 'confirm',
      message,
      tone: options.tone || 'default',
      confirmLabel: options.confirmLabel || '확인',
      cancelLabel: options.cancelLabel || '취소',
    }),
    alert: (message, options = {}) => request({
      kind: 'alert',
      message,
      tone: options.tone || 'default',
      confirmLabel: options.confirmLabel || '확인',
    }),
  }), [request]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog && (
        <Dialog
          {...dialog}
          onConfirm={() => settle(dialog.kind === 'alert' ? undefined : true)}
          onCancel={() => settle(dialog.kind === 'alert' ? undefined : false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function Dialog({ kind, message, tone, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  const danger = tone === 'danger';
  const confirmClass = danger
    ? 'btn-danger'
    : 'btn-primary';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface rounded-card shadow-card border border-line w-full max-w-sm p-5 space-y-4">
        <p className="text-sm text-body whitespace-pre-line leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          {kind === 'confirm' && (
            <button
              onClick={onCancel}
              className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control border border-line hover:bg-surface-page transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`text-sm px-4 py-2 rounded-control transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
