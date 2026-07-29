import React from 'react';
import { dailyBasis, heatClass, heatLabel } from '../lib/heatmap';

// 일별 지출 강도를 달력 격자로 보여준다.
//
// 색은 절대 금액이 아니라 기준선 대비 배수로 정한다. 절대 금액으로 칠하면 한 달에
// 30만원 쓰는 사람과 300만원 쓰는 사람의 같은 색이 서로 다른 의미가 된다.
//
// 5단계 전부 액센트 한 색의 농도다. 초과 단계에 손실색을 쓰지 않는다 — 초과 여부는
// 색이 아니라 범례와 셀 안의 날짜 숫자로 읽는다.
export default function SpendHeatmap({ year, month, dailyTotals, monthlyBudgetTotal, recentDailyAverage }) {
  // month 는 1~12 로 받는다. Date 의 0번째 날은 전달 마지막 날이므로 이 호출이
  // 그 달의 일수가 된다.
  const daysInMonth = new Date(year, month, 0).getDate();

  const basis = dailyBasis(monthlyBudgetTotal, daysInMonth, recentDailyAverage);

  // 1일이 무슨 요일인지에 따라 앞쪽 빈 칸 수가 정해진다.
  const startDay = new Date(year, month - 1, 1).getDay();

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  // 빈 칸은 null 로 둔다. 격자 자리는 차지하되 아무것도 그리지 않는다.
  const calendarDays = [];

  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const amount = dailyTotals[dateStr] || 0;
    calendarDays.push({ day, amount });
  }
  
  // 범례 램프는 단계별 색을 직접 쓰지 않고, 그 단계에 해당하는 대표 금액을 heatClass 에
  // 넣어 얻는다. 색 결정을 한 곳(heatmap.js)에 묶어두기 위해서다 — 여기서 색을 따로
  // 나열하면 규칙이 두 군데로 갈라진다.
  const lampAmounts = [
    0,
    basis * 0.25,
    basis * 0.75,
    basis * 1.5,
    basis * 3
  ];
  
  // 예산도 없고 폴백 일평균도 없으면 기준을 세울 수 없다. 이때 색을 칠하면 근거 없는
  // 강도를 보여주는 셈이라 칠하지 않고, 왜 비어 있는지를 범례에서 말한다.
  const hasBasis = basis > 0;
  
  return (
    <div className="flex flex-col">
      {/* 요일 머리글 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((day, index) => (
          <div key={index} className="text-meta text-caption text-center">
            {day}
          </div>
        ))}
      </div>
      
      {/* 셀 안의 날짜 숫자는 장식이 아니다. 색 단독으로 정보를 전달하지 않기 위한
          두 번째 채널이다(WCAG SC 1.4.1). title 의 배수 표기가 세 번째다. */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {calendarDays.map((cell, index) => (
          <div
            key={index}
            className={`aspect-square ${
              cell 
                ? 'rounded-chip flex items-center justify-center text-meta tabular-nums ' + heatClass(cell.amount, basis)
                : ''
            }`}
            title={
              cell 
                ? `${month}월 ${cell.day}일 · ${cell.amount.toLocaleString('ko-KR')}원 · ${heatLabel(cell.amount, basis)}`
                : undefined
            }
          >
            {cell ? cell.day : null}
          </div>
        ))}
      </div>
      
      {/* 범례 */}
      <div className="flex flex-col items-start text-meta text-caption">
        <div className="flex items-center justify-between w-full mb-1">
          <span>적음</span>
          <div className="flex space-x-1">
            {lampAmounts.map((amount, index) => (
              <div
                key={index}
                className={`w-4 h-4 rounded-chip ${heatClass(amount, basis)}`}
              />
            ))}
          </div>
          <span>많음</span>
        </div>
        
        <div>
          {hasBasis ? (
            <span>
              하루 기준 {Math.round(basis).toLocaleString('ko-KR')}원 ·{' '}
              {monthlyBudgetTotal > 0 && daysInMonth > 0
                ? '월 예산 ÷ 일수'
                : '최근 3개월 일평균'}
            </span>
          ) : (
            <span>기준을 정할 수 없어 색을 칠하지 않아요</span>
          )}
        </div>
      </div>
    </div>
  );
}
