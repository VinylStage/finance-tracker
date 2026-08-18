import React from 'react';

export default function CardBenefitCapsFields({ rows, onRowsChange, dates, onDatesChange, inp }) {
  const change = (index, key, value) => {
    const next = [...rows];
    next[index] = { ...next[index], [key]: value };
    onRowsChange(next);
  };

  const remove = (index) => {
    const next = [...rows];
    next.splice(index, 1);
    onRowsChange(next);
  };

  return (
    <div>
      <p className="block text-xs font-medium text-ink mb-1">혜택 한도 (선택)</p>
      <p className="text-xs text-caption mb-2">
        「하루 2만원까지」 · 「월 1회」 처럼 기간마다 다르게 걸 수 있어요. 금액과 횟수는 하나만 넣어도 돼요.
      </p>

      {/* 칸 이름을 줄 위에 한 번만 둔다. 줄마다 라벨을 붙이면 화면이 이름으로
          가득 차고, 아예 안 붙이면 가운데 칸이 무엇인지 알 수 없다. 화면 낭독기는
          각 칸의 aria-label 로 읽는다. */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 mb-1 text-xs text-caption">
          <span className="flex-1">기간</span>
          <span className="flex-1">금액 (원)</span>
          <span className="flex-1">횟수</span>
          <span className="w-7" />
        </div>
      )}

      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <select
            aria-label={`한도 ${i + 1} 기간`}
            value={row.window}
            onChange={(e) => change(i, 'window', e.target.value)}
            className={`${inp} flex-1`}
          >
            <option value="">기간 선택</option>
            <option value="transaction">건당</option>
            <option value="day">하루</option>
            <option value="month">월</option>
          </select>
          <input
            type="number"
            aria-label={`한도 ${i + 1} 금액`}
            value={row.amount}
            onChange={(e) => change(i, 'amount', e.target.value)}
            className={`${inp} flex-1`}
          />
          <input
            type="number"
            aria-label={`한도 ${i + 1} 횟수`}
            value={row.count}
            onChange={(e) => change(i, 'count', e.target.value)}
            className={`${inp} flex-1`}
          />
          {/* 보이는 것은 × 하나지만 이름은 그대로 「줄 삭제」 다. 글자를 그대로
              두면 줄이 좁아져 입력칸이 밀린다. */}
          <button
            type="button"
            aria-label="줄 삭제"
            title="줄 삭제"
            onClick={() => remove(i)}
            className="w-7 h-7 shrink-0 rounded-control text-caption hover:text-ink"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onRowsChange([...rows, { window: '', amount: '', count: '' }])}
        className="text-xs text-brand-fill hover:underline mb-4"
      >
        + 한도 추가
      </button>

      <div className="mt-2">
        <label className="block text-xs text-caption mb-1" htmlFor="benefit-dates">특정 날짜에만 (선택)</label>
        <input
          type="text"
          id="benefit-dates"
          value={dates}
          onChange={(e) => onDatesChange(e.target.value)}
          className={inp}
          placeholder="10-01, 06-06"
        />
        <p className="text-xs text-caption mt-1">
          <strong>MM-DD</strong> 로 쓰고 쉼표로 나눈다. 해마다 그 날에만 걸린다.
        </p>
      </div>
    </div>
  );
}
