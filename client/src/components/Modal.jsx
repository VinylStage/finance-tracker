import React, { useEffect, useRef } from 'react';
import { trapIndex } from '../lib/quickEntry';
import Icon from './Icon';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 포커스 트랩이 있는 모달(#196).
//
// busy 가 true 면 닫기 경로를 전부 막는다 — 저장 중에 모달이 닫히면 사용자는 저장이
// 됐는지 알 수 없고, 실패했을 때 입력을 되찾을 방법도 없다.
//
// 포커스 트랩이 필요한 이유: 트랩이 없으면 Tab 이 모달 밖 배경 요소로 새어나가
// 키보드 사용자가 보이지 않는 곳을 조작하게 된다. 다음 인덱스 계산은 순수 함수로
// 떼어내 유닛 테스트로 순환 동작을 고정했다(quickEntry.trapIndex).
export default function Modal({ title, onClose, busy = false, children }) {
  const panelRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    // 모달을 닫은 뒤 원래 있던 곳으로 포커스를 돌려줘야 키보드 흐름이 끊기지 않는다.
    lastFocusedRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      if (lastFocusedRef.current instanceof HTMLElement) lastFocusedRef.current.focus();
    };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (!busy) onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement);
    const next = trapIndex(current, items.length, e.shiftKey);
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/40 px-4 py-8"
      onMouseDown={(e) => {
        // 배경을 누른 경우에만 닫는다. 패널 안에서 시작한 드래그가 배경에서 끝나도 닫히면 안 된다.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-2xl rounded-card border border-line bg-surface shadow-card outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="modal-title" className="text-sm font-semibold text-body">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
            className="rounded-control px-2 py-1 text-sm text-caption hover:bg-surface-page hover:text-body disabled:opacity-40"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
