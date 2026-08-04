import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

// 기동 시 따라잡기(#279)가 만든 거래를 알린다(#280).
//
// catch-up 은 상한 없이 규칙대로 전부 만든다 — 공백이 길면 수십 건이 한 번에
// 생긴다. **사용자에게 안 알리면 자기가 만들지 않은 거래가 목록에 나타난 것으로
// 보인다.** 그게 이 앱에서 가장 겁나는 화면이다.
//
// 생성이 0 건이면 아무것도 띄우지 않는다. "새로 생긴 것 없음" 은 알릴 일이 아니다.
const DISMISSED_KEY = 'catchup-seen';

export default function CatchupNotice() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/recurring-rules/catchup').then((res) => {
      if (cancelled) return;
      if (!res || !res.created) return;
      // 같은 기동 결과를 새로고침할 때마다 다시 띄우지 않는다. 기동 날짜가
      // 바뀌면 다른 결과이므로 다시 띄운다.
      try {
        if (sessionStorage.getItem(DISMISSED_KEY) === String(res.today)) return;
      } catch { /* 저장소를 못 써도 알림 자체는 떠야 한다 */ }
      setSummary(res);
    }).catch(() => {
      // 알림이 안 뜨는 것은 기능 손실이 아니다.
    });
    return () => { cancelled = true; };
  }, []);

  if (!summary) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISSED_KEY, String(summary.today)); } catch { /* 저장 실패는 무시 */ }
    setSummary(null);
  };

  return (
    <div
      className="bg-brand-tint border border-brand-tint-strong rounded-card px-4 py-3 space-y-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-brand-text">
          반복 규칙에 따라 거래 {summary.created}건을 자동으로 만들었어요.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-caption hover:text-body shrink-0"
        >
          확인
        </button>
      </div>

      {/* 몇 건인지만 알리면 무엇이 생겼는지 확인하러 목록을 뒤져야 한다. */}
      {summary.details?.length > 0 && (
        <ul className="text-xs text-caption space-y-0.5">
          {summary.details.map((d) => (
            <li key={d.rule_id}>{d.merchant} {d.created}건</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-caption">
        잘못 생긴 것이 있으면 거래내역에서 지울 수 있어요.
      </p>
    </div>
  );
}
