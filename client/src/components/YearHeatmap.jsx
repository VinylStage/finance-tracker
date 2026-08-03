import React from 'react';
import SpendHeatmap from './SpendHeatmap';
import { yearMonths, bucketToDaily } from '../lib/heatmapPeriod';

// 연 단위 히트맵(#273).
//
// 연간 전용 격자를 새로 만들지 않고 월 히트맵을 12번 늘어놓는다. 이유가 있다.
//
// 연간 격자(53주 x 7일 형태)는 한 칸이 너무 작아 날짜 숫자를 넣을 수 없다.
// 그러면 색 단독 인코딩이 되어 접근성 기준(#191)을 어긴다. 월 격자를 재사용하면
// 날짜 숫자와 title 이 그대로 유지된다.
//
// 기준선(basis)은 12개월 모두 같은 값을 쓴다. 달마다 다시 계산하면 같은 색이
// 달마다 다른 금액을 뜻하게 되어 한 해를 비교할 수 없다.
export default function YearHeatmap({ year, buckets, monthlyBudgetTotal, recentDailyAverage }) {
  const months = yearMonths(year);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {months.map(({ month }) => (
        <div key={month} className="flex flex-col">
          <div className="text-meta text-caption mb-1">{month}월</div>
          <SpendHeatmap
            year={year}
            month={month}
            dailyTotals={bucketToDaily(buckets, year, month)}
            monthlyBudgetTotal={monthlyBudgetTotal}
            recentDailyAverage={recentDailyAverage}
          />
        </div>
      ))}
    </div>
  );
}
