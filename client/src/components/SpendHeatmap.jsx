import React from 'react';
import { dailyBasis, heatClass, heatLabel } from '../lib/heatmap';

export default function SpendHeatmap({ year, month, dailyTotals, monthlyBudgetTotal, recentDailyAverage }) {
  // 기준선을 계산한다. 예산과 일수를 사용하여 일별 예산을 구하고,
  // 예산이나 일수가 없으면 폴백값을 사용한다.
  const basis = dailyBasis(monthlyBudgetTotal, new Date(year, month, 0).getDate(), recentDailyAverage);
  
  // 달력의 시작 요일(0=일요일, 1=월요일, ..., 6=토요일)을 구한다.
  const startDay = new Date(year, month - 1, 1).getDay();
  
  // 해당 월의 총 일수를 구한다.
  const daysInMonth = new Date(year, month, 0).getDate();
  
  // 요일 머리글을 정의한다. WCAG 1.4.1 기준으로 텍스트로 요일을 표시한다.
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  
  // 날짜 칸들을 생성한다. 빈 칸과 실제 날짜 칸을 구분하여 배열에 담는다.
  const calendarDays = [];
  
  // 시작 요일만큼 빈 칸을 추가한다.
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  
  // 실제 날짜 칸들을 추가한다.
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const amount = dailyTotals[dateStr] || 0;
    calendarDays.push({ day, amount });
  }
  
  // 범례에 사용할 대표 금액들을 계산한다.
  // 각 단계의 기준 금액을 정의하여 램프 색상을 결정한다.
  const lampAmounts = [
    0,
    basis * 0.25,
    basis * 0.75,
    basis * 1.5,
    basis * 3
  ];
  
  // 기준선이 0이면 색칠하지 않고 설명을 바꾼다.
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
      
      {/* 달력 격자 */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {calendarDays.map((cell, index) => (
          <div
            key={index}
            className={`aspect-square rounded-chip flex items-center justify-center text-meta tabular-nums ${
              cell ? heatClass(cell.amount, basis) : ''
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
              하루 기준 {basis.toLocaleString('ko-KR')}원 ·{' '}
              {monthlyBudgetTotal > 0 && new Date(year, month, 0).getDate() > 0
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
