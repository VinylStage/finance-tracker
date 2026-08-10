import React from 'react';
import MonthCalendarGrid from './MonthCalendarGrid';

// 거래내역을 한 달 달력으로 보여준다. 목록뷰와 같은 데이터를 다르게 그릴 뿐,
// 새로 조회하지 않는다.
//
// 월 이동은 이 화면 자체의 상태다. 대시보드의 기간 필터(#272)와 공유하지 않는다
// — 거래내역을 훑다가 대시보드로 돌아갔을 때 보던 달이 바뀌어 있으면 안 된다.
export default function TransactionCalendar({ year, month, buckets, onPrev, onNext, onSelectDay, selectedDay }) {
  const label = `${year}년 ${month}월`;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrev}
          aria-label="이전 달"
          className="px-3 py-1 rounded-chip border border-line text-caption hover:bg-surface-2"
        >
          ←
        </button>
        {/* 월 이동은 화면을 다시 그리지만 제목은 그대로 남는다. 스크린리더가
            바뀐 달을 읽도록 aria-live 를 둔다. */}
        <div className="text-body tabular-nums" aria-live="polite">{label}</div>
        <button
          type="button"
          onClick={onNext}
          aria-label="다음 달"
          className="px-3 py-1 rounded-chip border border-line text-caption hover:bg-surface-2"
        >
          →
        </button>
      </div>

      <MonthCalendarGrid
        year={year}
        month={month}
        cellBaseClassName="min-h-16 sm:min-h-20"
        renderCell={(day) => {
          const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const b = buckets[key];
          return (
            <div className="flex flex-col items-center justify-start w-full h-full pt-1 leading-tight">
              <span className="text-meta tabular-nums">{day}</span>
              {/* 거래가 없는 날은 아무 숫자도 그리지 않는다. 0 을 쓰면 "안 썼다" 와
                  "기록을 안 했다" 가 같아 보인다(#273 이 히트맵에서 정한 것과 같은 원칙). */}
              {b && b.expense > 0 && (
                <span className="text-meta tabular-nums text-loss">
                  -{b.expense.toLocaleString('ko-KR')}
                </span>
              )}
              {b && b.income > 0 && (
                <span className="text-meta tabular-nums text-accent">
                  +{b.income.toLocaleString('ko-KR')}
                </span>
              )}
            </div>
          );
        }}
        cellProps={(day) => {
          const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const b = buckets[key];
          const selected = selectedDay === key;
          return {
            onClick: () => onSelectDay(key),
            role: 'button',
            tabIndex: 0,
            'aria-label': b
              ? `${month}월 ${day}일 · 지출 ${b.expense.toLocaleString('ko-KR')}원 · 수입 ${b.income.toLocaleString('ko-KR')}원 · ${b.count}건`
              : `${month}월 ${day}일 · 거래 없음`,
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectDay(key);
              }
            },
            className: `rounded-chip border cursor-pointer overflow-hidden ${
              selected ? 'border-accent bg-surface-2' : 'border-line'
            }`,
          };
        }}
      />
    </div>
  );
}
