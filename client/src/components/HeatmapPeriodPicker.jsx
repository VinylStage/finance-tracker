import React from 'react';

// 히트맵의 연·월 선택(#273).
//
// 이 컨트롤은 **대시보드의 전역 기간 필터와 독립**이다(A안 확정). 규칙이 하나뿐이라
// 사용자가 예측할 수 있고, 전역 기간을 따라가는 안들은 "왜 내가 고른 기간이 아닌
// 게 보이지" 를 만든다.
//
// 다만 화면에 기간 컨트롤이 둘 보이는 상태가 되므로, 여기가 히트맵 전용이라는
// 것을 라벨로 드러낸다.
export default function HeatmapPeriodPicker({ mode, year, month, onChange }) {
  const shift = (delta) => {
    if (mode === 'year') {
      onChange({ mode, year: year + delta, month });
      return;
    }
    const d = new Date(year, month - 1 + delta, 1);
    onChange({ mode, year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const label = mode === 'year' ? `${year}년` : `${year}년 ${month}월`;

  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1">
        {[['month', '월'], ['year', '연']].map(([m, text]) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ mode: m, year, month })}
            aria-pressed={mode === m}
            className={`text-meta px-2 py-1 rounded-chip border transition-colors ${
              mode === m
                ? 'bg-brand-tint border-brand-tint-strong text-brand-text'
                : 'border-line text-caption hover:bg-surface-page'
            }`}
          >
            {text}
          </button>
        ))}
        {/* 이 컨트롤이 히트맵만 움직인다는 것을 밝힌다. 대시보드 기간과 따로 논다. */}
        <span className="text-meta text-caption ml-1">이 그래프만</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label={mode === 'year' ? '이전 해' : '이전 달'}
          className="px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-2"
        >
          ←
        </button>
        <span className="text-meta tabular-nums" aria-live="polite">{label}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label={mode === 'year' ? '다음 해' : '다음 달'}
          className="px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-2"
        >
          →
        </button>
      </div>
    </div>
  );
}
