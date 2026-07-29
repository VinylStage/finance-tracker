import React from 'react';
import { savingsProgress, MILESTONES } from '../lib/savingsProgress';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

// goal-gradient effect(Kivetz et al. 2006): 목표에 가까워질수록 동기가 강해진다.
// 그래서 "38%" 가 아니라 "820,000원 남음" 을 주 정보로 올린다. 퍼센트는 보조로 내린다.
// 큰 목표는 25/50/75% 마일스톤으로 쪼개 구간마다 도달감을 반복 제공한다.
export default function SavingsGoalBar({ product, today }) {
  const p = savingsProgress(product, today);

  if (!p.hasSchedule) {
    return <span className="text-xs text-caption">만기일을 입력하면 목표 진행이 표시됩니다</span>;
  }

  const done = p.remaining === 0;

  return (
    <div className="min-w-[9rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-semibold tabular-nums ${done ? 'text-goal-text' : 'text-ink'}`}>
          {done ? '목표 달성' : `${fmt(p.remaining)} 남음`}
        </span>
        <span className="text-[10px] text-caption tabular-nums shrink-0">{p.barPct}%</span>
      </div>

      {/* 저축·목표는 goal 토큰을 쓴다. 액센트(수입·차트)도 손실(지출)도 아닌
          제3의 상태이고, 상태 배지·진행바·차트에만 나타난다. */}
      <div className="relative mt-1.5 h-2 rounded-bar bg-surface-sunken">
        <div
          className="h-2 rounded-bar bg-goal-fill transition-all"
          style={{ width: `${p.barPct}%` }}
        />
        {/* 마일스톤 눈금. 진행바 위에 얹어 남은 구간을 시각적으로 쪼갠다.
            흰 눈금은 채워지지 않은 트랙 위에서 보이지 않는다(트랙과 1.06). ink 는
            트랙(13.63)과 채움(3.45) 양쪽에서 보이는 유일한 무채색이다. */}
        {MILESTONES.map((m) => (
          <span
            key={m}
            aria-hidden="true"
            className="absolute top-0 h-2 w-px bg-ink"
            style={{ left: `${m * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-caption tabular-nums">
          {p.paidMonths}/{p.totalMonths}회 · {fmt(p.contributed)}
        </span>
        {p.milestone !== null && !done && (
          <span className="shrink-0 rounded-pill bg-goal-tint px-1.5 py-0.5 text-[10px] font-medium text-goal-text">
            {Math.round(p.milestone * 100)}% 돌파
          </span>
        )}
      </div>
    </div>
  );
}
