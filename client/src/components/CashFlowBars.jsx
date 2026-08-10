import React from 'react';
import { cashFlow, REST_KEY } from '../lib/cashFlow';
import { formatWon } from '../lib/format';


// 수입이 어디로 갔는지를 한 장으로 답한다.
//
// 개별 KPI 는 "얼마 벌었나" 와 "얼마 썼나" 를 따로 말할 뿐 그 사이의 배분을 보여주지
// 못한다. 배분을 보려면 수입 한 덩어리가 여러 갈래로 갈라지는 형태가 필요하다.
//
// 100% 스택 바 + 목록으로 그린다. 데스크톱 Sankey 는 후속이며, 그때도 집계는
// lib/cashFlow.js 를 그대로 쓴다 — 두 뷰가 서로 다른 집계를 쓰면 같은 화면에서
// 숫자가 어긋난다.
//
// 대분류색은 hue 2개 원칙의 유일한 예외 구역이다. 그 색은 이 바와 목록의 색점에만
// 살고 다른 화면 요소로 새어나가지 않는다. 접근 경로를 cashFlow.flowColor 하나로
// 좁혀둔 이유가 그것이다.
export default function CashFlowBars({ rows, income }) {
  const flow = cashFlow(rows, income);

  if (flow.nodes.length === 0) {
    return <p className="text-caption text-sm text-center py-6">이번 달 자금 흐름을 그릴 내역이 없습니다.</p>;
  }

  return (
    <div>
      {/* 막대는 갈래의 크기를 길이로 말한다. 색은 어느 갈래인지만 구분하고,
          의미는 아래 목록의 이름과 금액이 전달한다 — 색 단독 전달이 아니다. */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-bar bg-surface-sunken"
        role="img"
        aria-label={`수입 ${formatWon(flow.income)} 중 ${flow.nodes.map((n) => `${n.key} ${Math.round(n.share * 100)}%`).join(', ')}`}
      >
        {flow.nodes.map((n) => (
          <div
            key={n.key}
            style={{ width: `${n.share * 100}%`, background: n.color }}
            title={`${n.key} · ${formatWon(n.value)} · ${Math.round(n.share * 100)}%`}
          />
        ))}
      </div>

      {/* 목록 순서는 막대 세그먼트 순서와 같다. 눈이 왼쪽에서 오른쪽으로 훑은 순서를
          그대로 위에서 아래로 잇기 위해서다. */}
      <ul className="mt-3 space-y-1.5">
        {flow.nodes.map((n) => (
          <li key={n.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-body">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-bar"
                style={{ background: n.color }}
              />
              {n.key}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className={n.key === REST_KEY ? 'text-body' : 'text-ink'}>{formatWon(n.value)}</span>
              <span className="ml-1.5 text-caption">{Math.round(n.share * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-line-faint pt-2 text-meta text-caption tabular-nums">
        수입 {formatWon(flow.income)} · 지출 {formatWon(flow.spent)}
        {flow.overspent > 0 ? (
          // 지출이 수입을 넘긴 달은 '남은 돈' 이 없다. 막대에 음수 밴드를 그릴 수는
          // 없으므로 초과분은 문구가 맡는다.
          <span className="text-loss-text"> · {formatWon(flow.overspent)} 초과</span>
        ) : (
          <span> · 남은 돈 {formatWon(flow.rest)}</span>
        )}
      </p>
    </div>
  );
}
