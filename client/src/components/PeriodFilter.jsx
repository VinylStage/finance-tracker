import React from 'react';
import { PRESETS, rangeForPreset, validateRange } from '../lib/periodFilter';

// 기간 선택 컨트롤(#272).
//
// 프리셋을 누르면 계산된 from/to 가 URL 에 실린다. `?preset=this-month` 만
// 실으면 어제 북마크한 링크가 오늘 다른 기간을 가리킨다.
//
// 직접 지정은 **바로 반영하지 않는다.** 사용자가 시작일을 고르는 순간
// 종료일은 아직 옛 값이라, 매 입력마다 조회하면 뒤집힌 기간으로 한 번 요청이
// 나간다. 두 값이 다 정해진 뒤에 넘긴다.

export default function PeriodFilter({ period, onChange, className = '' }) {
  const { preset, from, to, includeDerived, invalid } = period;

  const pick = (key) => {
    if (key === 'custom') {
      onChange({ from, to });
      return;
    }
    onChange(rangeForPreset(key));
  };

  const setCustom = (nextFrom, nextTo) => {
    // 형식이 안 갖춰진 중간 상태에서는 조회하지 않는다.
    if (validateRange(nextFrom, nextTo)) return;
    onChange({ from: nextFrom, to: nextTo });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="조회 기간">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => pick(p.key)}
            aria-pressed={preset === p.key}
            className={`text-xs px-3 py-1.5 rounded-control border transition-colors ${
              preset === p.key
                ? 'border-brand-text text-brand-text bg-brand-tint'
                : 'border-line text-caption hover:bg-surface-page'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="period-from">시작일</label>
          <input
            id="period-from"
            type="date"
            value={from}
            onChange={(e) => setCustom(e.target.value, to)}
            className="text-xs border border-line rounded-control px-2 py-1.5 bg-surface text-ink"
          />
          <span className="text-xs text-caption">~</span>
          <label className="sr-only" htmlFor="period-to">종료일</label>
          <input
            id="period-to"
            type="date"
            value={to}
            onChange={(e) => setCustom(from, e.target.value)}
            className="text-xs border border-line rounded-control px-2 py-1.5 bg-surface text-ink"
          />
        </div>
      )}

      {/* 잘못된 기간은 조용히 기본값으로 떨어뜨리지 않고 이유를 말한다.
          주소창을 고친 사용자가 왜 다른 기간이 나오는지 알아야 한다. */}
      {invalid && <p className="text-xs text-loss-text">{invalid}</p>}

      <label className="flex items-center gap-2 text-xs text-caption">
        <input
          type="checkbox"
          checked={includeDerived}
          onChange={(e) => onChange({ includeDerived: e.target.checked })}
          className="rounded border-line"
        />
        {/* #269 가 B안으로 확정돼 파생 행이 실제 지출 기록 그 자체다. 끄면
            할부 지출이 합계에서 통째로 빠진다는 것을 문구가 말해야 한다. */}
        할부·리볼빙 등 자동 생성 내역 포함
      </label>
    </div>
  );
}
