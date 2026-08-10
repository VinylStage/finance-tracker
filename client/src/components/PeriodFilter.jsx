import React from 'react';
import { PRESETS, rangeForPreset, validateRange, rangeForMonth, monthShorthand } from '../lib/periodFilter';

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

  // '월 선택' 이 열 때 보여줄 달. 보고 있던 기간의 시작월을 그대로 쓴다 —
  // 최근 3개월(6~8월)에서 월 선택으로 넘어가면 6월이 잡힌다. 오늘 달로 튀면
  // 사용자가 보던 곳을 잃는다.
  const currentMonth = monthShorthand({ from, to }) || (from || '').slice(0, 7);

  const pick = (key) => {
    if (key === 'custom') {
      onChange({ from, to });
      return;
    }
    if (key === 'month') {
      // 이미 한 달 범위면 그대로 두고 컨트롤만 연다. 아니면 시작월 전체로 편다.
      onChange(rangeForMonth(currentMonth) || { from, to });
      return;
    }
    onChange(rangeForPreset(key));
  };

  const setMonth = (ym) => {
    const r = rangeForMonth(ym);
    // 사용자가 입력칸을 비우는 중간 상태가 있다. 그때 조회하지 않는다.
    if (r) onChange(r);
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

      {preset === 'month' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="period-month">조회할 달</label>
          {/* `<input type="month">` 를 쓰는 이유: 말일이 달마다 달라(28/30/31)
              시작일·종료일을 손으로 채우면 사용자가 그걸 기억해야 한다.
              브라우저 기본 컨트롤이라 키보드·스크린리더도 그대로 동작한다. */}
          <input
            id="period-month"
            type="month"
            value={currentMonth}
            onChange={(e) => setMonth(e.target.value)}
            className="text-xs border border-line rounded-control px-2 py-1.5 bg-surface text-ink"
          />
        </div>
      )}

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
