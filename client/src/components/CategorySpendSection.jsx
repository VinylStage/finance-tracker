import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { capTopCategories, shareOf, sliceColor, OTHERS_LABEL } from '../lib/categoryChart';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

// 파이 조각에 마우스를 올렸을 때 뜨는 툴팁. '기타' 조각이면 어떤 카테고리가
// 묶였는지 목록으로 펼쳐 준다 — 캡핑 때문에 사라진 정보를 여기서 되돌려준다.
function SliceTooltip({ active, payload, others }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-surface border border-line rounded-card shadow-card px-3 py-2 text-xs">
      <p className="font-medium text-ink">{row.category}</p>
      <p className="text-body tabular-nums">{fmt(row.total)}</p>
      {row.isOthers && others.length > 0 && (
        <ul className="mt-1.5 pt-1.5 border-t border-line-faint space-y-0.5 text-caption">
          {others.map((o) => (
            <li key={o.category} className="flex justify-between gap-3">
              <span>{o.category}</span>
              <span className="tabular-nums">{fmt(o.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CategorySpendSection({ rows }) {
  // 랭킹 막대가 기본 뷰다. 파이차트는 각도 비교라 순위·격차를 읽기 어렵다.
  const [view, setView] = useState('rank');
  const { slices, others } = capTopCategories(rows);
  const grandTotal = slices.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const othersNames = others.map((o) => o.category).join(', ');

  const toggleClass = (on) =>
    `text-xs px-2.5 py-1 rounded-control transition-colors ${
      on ? 'bg-brand-tint text-brand-text font-medium' : 'text-caption hover:text-body hover:bg-surface-page'
    }`;

  return (
    <div className="bg-surface shadow-card rounded-card p-5 border border-line">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-sm font-semibold text-body">카테고리별 지출</h2>
        <div className="flex gap-1" role="group" aria-label="보기 전환">
          <button type="button" onClick={() => setView('rank')} aria-pressed={view === 'rank'} className={toggleClass(view === 'rank')}>
            랭킹
          </button>
          <button type="button" onClick={() => setView('pie')} aria-pressed={view === 'pie'} className={toggleClass(view === 'pie')}>
            파이
          </button>
        </div>
      </div>

      {slices.length === 0 ? (
        <div className="text-caption text-sm text-center py-10">이번 달 지출 내역이 없습니다.</div>
      ) : view === 'rank' ? (
        <ol className="space-y-2.5">
          {slices.map((c, i) => {
            const share = shareOf(c.total, grandTotal);
            return (
              <li key={c.category} title={c.isOthers ? othersNames : undefined}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-body truncate">
                    {/* 문구 앞의 색상 점을 순번으로 바꿨다. 점은 카테고리마다 hue 를
                        하나씩 배정해야 성립하는 장치라 카테고리가 늘어나면 무너진다.
                        순위는 색 없이도 읽히고 랭킹 뷰의 목적에도 더 맞는다. */}
                    <span className="w-4 shrink-0 text-caption tabular-nums">{i + 1}</span>
                    {c.isOthers ? `${OTHERS_LABEL} (${others.length}개)` : c.category}
                  </span>
                  <span className="shrink-0 text-ink font-medium tabular-nums">
                    {fmt(c.total)}
                    <span className="ml-1.5 text-caption">{Math.round(share * 100)}%</span>
                  </span>
                </div>
                {/* 막대는 전부 같은 액센트 한 색. 길이가 크기를 전달하므로
                    색으로 카테고리를 구분할 이유가 없다. */}
                <div className="h-1.5 bg-surface-sunken rounded-bar">
                  <div
                    className={`h-1.5 rounded-bar ${c.isOthers ? 'bg-caption' : 'bg-brand-fill'}`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
                {c.isOthers && (
                  <p className="mt-1 text-[10px] text-caption truncate">{othersNames}</p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={slices} dataKey="total" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {slices.map((c, i) => (
                <Cell key={c.category} fill={sliceColor(i, c.isOthers)} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip others={others} />} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
