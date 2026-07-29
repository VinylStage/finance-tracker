import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { WELCOME_STEPS, markOnboardingDone } from '../lib/onboarding';

// 최초 실행 웰컴(#197). 3단계, 언제든 건너뛸 수 있다.
//
// 첫 화면에서 사용자를 막아 세우는 UI 라 빠져나갈 길을 넉넉히 둔다 —
// 건너뛰기 버튼, ESC 키, 배경 클릭 셋 다 닫힌다. 어느 경로로 닫든 완료로 기록해
// 다시 뜨지 않게 한다. 다시 보려면 설정에서 되돌릴 수 있다.
export default function WelcomeFlow({ onClose }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef(null);
  const step = WELCOME_STEPS[index];
  const isLast = index === WELCOME_STEPS.length - 1;

  const finish = () => {
    markOnboardingDone();
    onClose();
  };

  useEffect(() => {
    // 모달이 열려 있는 동안 배경 스크롤을 잠근다.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 열리자마자 모달로 포커스를 옮겨야 키보드 사용자가 ESC·Tab 을 쓸 수 있다.
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim/40 px-4"
      onClick={finish}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-card outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            {WELCOME_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 w-6 rounded-full ${i <= index ? 'bg-brand-fill' : 'bg-surface-sunken'}`}
              />
            ))}
          </div>
          <span className="text-[10px] text-caption tabular-nums">
            {index + 1}/{WELCOME_STEPS.length}
          </span>
        </div>

        <h2 id="welcome-title" className="mt-5 text-lg font-semibold text-ink">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-body">{step.body}</p>

        {step.cta && (
          <Link
            href={step.cta.href}
            onClick={finish}
            className="mt-4 inline-block rounded-control bg-brand-tint px-3 py-1.5 text-xs font-medium text-brand-text hover:bg-brand-tint/70"
          >
            {step.cta.label}
          </Link>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-caption hover:text-body"
          >
            건너뛰기
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="rounded-control px-3 py-1.5 text-sm text-body hover:bg-surface-page"
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
              className="btn-primary px-4 py-1.5 text-sm"
            >
              {isLast ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
