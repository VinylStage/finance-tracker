import React from 'react';

// 한 달치 달력 격자만 그린다. 셀 안에 무엇을 넣을지는 호출부가 정한다.
//
// 격자 계산(그 달의 일수, 1일의 요일, 앞쪽 빈 칸)은 달마다 틀리기 쉬운 곳이라
// 한 곳에 모은다. 히트맵·거래내역 달력뷰·날짜 선택이 각자 구현하면 윤년과 월
// 경계 버그가 세 번 따로 난다.
//
// 월 이동 컨트롤은 여기 두지 않는다. 화면마다 기간 상태를 다르게 갖기 때문이다
// — 히트맵은 자체 연·월(#273), 거래내역 달력뷰는 그 화면 상태(#305).
// cellBaseClassName 은 모든 칸(빈 칸 포함)에 붙는 기본 클래스다. 기본값이
// aspect-square 인 것은 히트맵처럼 좁은 폭에서 정사각형이 맞기 때문이고, 전체 폭
// 달력에서는 정사각형이 과하게 높아져 호출부가 바꿀 수 있게 열어 둔다.
export default function MonthCalendarGrid({ year, month, renderCell, cellProps, cellBaseClassName = 'aspect-square' }) {
  // month 는 1~12 로 받는다. Date 의 0번째 날은 전달 마지막 날이므로 이 호출이
  // 그 달의 일수가 된다.
  const daysInMonth = new Date(year, month, 0).getDate();

  // 1일이 무슨 요일인지에 따라 앞쪽 빈 칸 수가 정해진다.
  const startDay = new Date(year, month - 1, 1).getDay();

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  // 빈 칸은 null 로 둔다. 격자 자리는 차지하되 아무것도 그리지 않는다.
  const calendarDays = [];

  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <>
      {/* 요일 머리글 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((day, index) => (
          <div key={index} className="text-meta text-caption text-center">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-3">
        {calendarDays.map((day, index) => {
          // 빈 칸에는 호출부의 props 를 붙이지 않는다. 날짜가 없으므로 제목도
          // 클릭 대상도 성립하지 않는다.
          const { className, ...rest } = day !== null && cellProps ? cellProps(day) : {};
          return (
            <div
              key={index}
              {...rest}
              className={`${cellBaseClassName} ${day !== null && className ? className : ''}`}
            >
              {day !== null && renderCell ? renderCell(day) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
