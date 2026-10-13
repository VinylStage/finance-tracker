import React, { useState } from 'react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import { formatWon, formatAxisTick } from '../lib/format';

// 데이터 기반 장기 현금흐름 전망 (스펙 B). 아래 손입력 시뮬레이터와 달리 실제
// 반복 수입/지출·할부·보유현금 앵커로 월별 잔액을 그린다. 가정 지출(휴대폰 할부)을
// 넣으면 두 선을 겹쳐 비교한다. 계산은 서버(/api/advisor/projection).

const HORIZONS = [12, 24, 36];

export default function AdvisorProjectionChart() {
  const [horizon, setHorizon] = useState(24);
  const [phone, setPhone] = useState({ price: '', months: '24', start: '' });
  const [applied, setApplied] = useState(null);
  const [data, setData] = useState(null);

  const { error } = useLoader(async () => {
    const q = new URLSearchParams({ horizon: String(horizon) });
    if (applied) {
      q.set('phone', applied.price);
      q.set('phoneMonths', applied.months);
      if (applied.start) q.set('phoneStart', applied.start);
    }
    const d = await api.get(`/api/advisor/projection?${q}`);
    setData(d && d.base && Array.isArray(d.base.timeline) ? d : null);
  }, [horizon, applied && `${applied.price}/${applied.months}/${applied.start}`]);

  if (error || !data) return null;

  const rows = data.base.timeline.map((t, i) => ({
    month: t.month,
    기본: t.balance,
    ...(data.withSim ? { '가정 포함': data.withSim.timeline[i].balance } : {}),
  }));
  const last = data.base.timeline[data.base.timeline.length - 1];
  const sim = data.withSim;

  const apply = (e) => {
    e.preventDefault();
    if (!phone.price) { setApplied(null); return; }
    setApplied({ ...phone });
  };

  return (
    <section className="bg-surface shadow-card rounded-card p-5 border border-line space-y-3" aria-label="현금흐름 전망">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-body">현금흐름 전망 (실데이터)</h2>
        <span className="text-caption text-xs">{data.anchor.month} 잔액 {formatWon(data.anchor.amount)}에서 출발</span>
      </div>

      <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="전망 기간">
        {HORIZONS.map((h) => (
          <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h}
            className={`px-2 py-0.5 rounded-full border ${horizon === h ? 'bg-brand-tint text-brand-text border-brand-text' : 'border-line text-caption'}`}>
            {h}개월
          </button>
        ))}
      </div>

      <form onSubmit={apply} className="flex flex-wrap items-end gap-2 text-sm" aria-label="가정 지출">
        <label className="flex flex-col text-caption text-xs">휴대폰 가격(원)
          <input inputMode="numeric" value={phone.price} onChange={(e) => setPhone({ ...phone, price: e.target.value.replace(/\D/g, '') })} className="border border-line rounded px-2 py-1 text-ink w-32" placeholder="1500000" />
        </label>
        <label className="flex flex-col text-caption text-xs">할부 개월
          <input inputMode="numeric" value={phone.months} onChange={(e) => setPhone({ ...phone, months: e.target.value.replace(/\D/g, '') })} className="border border-line rounded px-2 py-1 text-ink w-16" />
        </label>
        <label className="flex flex-col text-caption text-xs">시작월
          <input type="month" value={phone.start} onChange={(e) => setPhone({ ...phone, start: e.target.value })} className="border border-line rounded px-2 py-1 text-ink" />
        </label>
        <button type="submit" className="px-3 py-1 rounded bg-brand-fill text-white">{phone.price ? '반영' : '가정 지우기'}</button>
      </form>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m) => m.slice(2)} tick={{ fontSize: 10, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={formatAxisTick} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip formatter={(v) => formatWon(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--color-loss-text, #ef4444)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="기본" stroke="var(--color-brand-fill)" strokeWidth={2} dot={false} />
          {sim && <Line type="monotone" dataKey="가정 포함" stroke="var(--color-caption)" strokeWidth={2} dot={false} />}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-body" data-testid="projection-summary">
        {last.month} 잔액 {formatWon(last.balance)} · 첫 적자월 {data.base.firstNegativeMonth || '없음'}
        {sim && <> · 가정 포함 {formatWon(sim.timeline[sim.timeline.length - 1].balance)} · 첫 적자월 {sim.firstNegativeMonth || '없음'}</>}
      </p>

      {/* 그래프만으로는 금액을 알 수 없다 — 월별 구체 숫자를 표로 함께 보인다(필수 요구사항). */}
      <div className="max-h-64 overflow-auto border border-line rounded-card">
        <table className="w-full text-xs tabular-nums" data-testid="projection-table">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-caption text-right">
              <th className="px-2 py-1 text-left font-medium">월</th>
              <th className="px-2 py-1 font-medium">여유자금</th>
              <th className="px-2 py-1 font-medium">월말 잔액</th>
              {sim && <th className="px-2 py-1 font-medium">가정 잔액</th>}
            </tr>
          </thead>
          <tbody>
            {data.base.timeline.map((t, i) => {
              const neg = t.balance < 0;
              return (
                <tr key={t.month} className="border-t border-line text-right">
                  <td className="px-2 py-1 text-left text-caption">{t.month}</td>
                  <td className={`px-2 py-1 ${t.net < 0 ? 'text-loss-text' : 'text-body'}`}>{formatWon(t.net)}</td>
                  <td className={`px-2 py-1 ${neg ? 'text-loss-text font-semibold' : 'text-ink'}`}>{formatWon(t.balance)}</td>
                  {sim && (
                    <td className={`px-2 py-1 ${sim.timeline[i].balance < 0 ? 'text-loss-text font-semibold' : 'text-caption'}`}>{formatWon(sim.timeline[i].balance)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
