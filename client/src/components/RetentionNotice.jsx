import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

// 감사로그 보존 정책(#367)이 이번 기동에서 무엇을 지웠는지 알린다.
//
// #367 이 "자동이면 사후 고지" 로 정했고 라우트도 그 계약을 주석에 적어 뒀는데,
// **알리는 화면이 없어서 정리가 조용히 돌고 있었다**(#445). ADR 0008 이 요구한
// "조용히 넘어가지 않는다" 가 지켜지지 않던 자리다.
//
// 변경 이력 화면에 둔다. 대시보드가 아니라 여기인 이유는, 지워진 것이 여기 있던
// 데이터이기 때문이다 — "예전 이력이 안 보이네" 하는 순간에 답이 되는 자리다.
//
// 지운 것이 0 건이면 아무것도 띄우지 않는다. "지운 것 없음" 은 알릴 일이 아니다.
const DISMISSED_KEY = 'audit-retention-seen';

export default function RetentionNotice() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/audit/retention').then((res) => {
      if (cancelled) return;
      // 괄호를 넣어 우선순위를 눈에 보이게 한다. `deleted` 가 없는 응답도
      // 안 띄운다 — 0 과 "값이 없음" 을 같게 다뤄야 빈 알림이 안 뜬다.
      if (!res) return;
      if (!res.error && !(res.deleted > 0)) return;
      // 같은 기동 결과를 새로고침할 때마다 다시 띄우지 않는다. 기동 날짜가
      // 바뀌면 다른 결과이므로 다시 띄운다.
      try {
        if (sessionStorage.getItem(DISMISSED_KEY) === String(res.cutoff)) return;
      } catch { /* 저장소를 못 써도 알림 자체는 떠야 한다 */ }
      setSummary(res);
    }).catch(() => {
      // 알림이 안 뜨는 것은 기능 손실이 아니다.
    });
    return () => { cancelled = true; };
  }, []);

  if (!summary) return null;

  // error 가 있을 때는 확인 버튼도 없고, sessionStorage 도 쓰지 않는다.
  // 매번 떠야 고쳐진다.
  if (summary.error) {
    return (
      <p className="text-xs text-caption">
        오래된 변경 이력을 정리하지 못했어요. 이력이 계속 쌓입니다.
      </p>
    );
  }

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISSED_KEY, String(summary.cutoff)); } catch { /* 저장 실패는 무시 */ }
    setSummary(null);
  };

  return (
    <div
      className="bg-brand-tint border border-brand-tint-strong rounded-card px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-brand-text">
          {summary.days}일 지난 변경 이력 {summary.deleted}건을 정리했어요.
          {summary.cutoff && ` ${summary.cutoff} 이전 기록이에요.`}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-caption hover:text-body shrink-0"
        >
          확인
        </button>
      </div>
    </div>
  );
}
