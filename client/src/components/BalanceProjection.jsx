// 앞으로의 잔액(#291).
//
// 예측이라는 것을 숨기지 않는다. 반영 범위를 항상 함께 보여주고, 마이너스로
// 도는 시점이 있으면 그것을 글자로 말한다 — 색으로만 표시하면 못 보는 사람이 있다.

import React from 'react';
import { formatWon } from '../lib/balanceView';
import { monthLabel, describeScope, describeNegativeTurn } from '../lib/projectionView';

export default function BalanceProjection({ projection }) {
  if (!projection || !projection.months || projection.months.length === 0) {
    return <p className="text-caption">앞으로 예정된 내역이 없어요.</p>;
  }

  const { months, includes, negativeFrom } = projection;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">앞으로의 잔액</h2>
      
      <div className="space-y-2">
        {months.map((month) => (
          <div key={month.month} className="flex justify-between items-center py-1">
            <span className="text-body">{monthLabel(month.month, projection.asOf)}</span>
            <div className="flex items-center gap-3">
              <span className="text-body tabular-nums">
                {month.change === 0 ? '—' : formatWon(month.change)}
              </span>
              <span className="text-body tabular-nums">{formatWon(month.balance)}</span>
            </div>
          </div>
        ))}
      </div>

      {negativeFrom && (
        <p className="text-sm text-loss-text mt-2">
          {describeNegativeTurn(projection)}
        </p>
      )}

      <p className="text-sm text-caption mt-2">
        {describeScope(includes)}
      </p>
    </div>
  );
}
