import React, { useEffect, useState, useCallback } from 'react';
import {
  ComposedChart, Area, Line, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';

const TABS = [
  { key: 'daily', label: '일별' },
  { key: 'weekly', label: '주별' },
  { key: 'monthly', label: '월별' },
  { key: 'yearly', label: '연도별' },
];

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function shortFmt(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 10000) return `${Math.round(v / 10000)}만`;
  return v.toLocaleString('ko-KR');
}

function today() { return new Date().toISOString().slice(0, 10); }

function StatCard({ label, value, diff, pct, invert }) {
  const good = diff === 0 ? null : invert ? diff < 0 : diff > 0;
  const diffColor = good === null ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600';
  return (
    <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
      <p className="text-slate-500 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{fmt(value)}</p>
      <p className={`text-xs mt-1 ${diffColor}`}>
        전 기간 대비 {diff >= 0 ? '+' : ''}{fmt(diff)}
        {pct !== null && pct !== undefined && ` (${pct >= 0 ? '+' : ''}${pct}%)`}
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function OverlayChart({ data, xKey, currentKey, previousKey, currentName, previousName, color, gradientId }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
        <Tooltip formatter={(v) => fmt(v)} />
        <Area type="monotone" dataKey={currentKey} name={currentName} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} connectNulls />
        <Line type="monotone" dataKey={previousKey} name={previousName} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function Comparison() {
  const [period, setPeriod] = useState('monthly');
  const [date, setDate] = useState(today());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ period, date });
    fetch(`/api/transactions/period-comparison?${params.toString()}`)
      .then(r => r.json())
      .then(d => { setResult(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period, date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">기간 비교</h1>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setPeriod(t.key)}
            className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${
              period === t.key ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading || !result ? (
        <div className="text-slate-500 text-center py-20">로딩 중...</div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            현재 기간 <span className="text-slate-600 font-medium">{result.currentLabel}</span>
            {' '}vs 직전 기간 <span className="text-slate-600 font-medium">{result.previousLabel}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="수입" value={result.summary.currentIncome} diff={result.summary.incomeDiff} pct={result.summary.incomeDiffPercent} />
            <StatCard label="지출" value={result.summary.currentExpense} diff={result.summary.expenseDiff} pct={result.summary.expenseDiffPercent} invert />
            <StatCard label="순증감" value={result.summary.currentNet} diff={result.summary.netDiff} pct={result.summary.netDiffPercent} />
          </div>

          <Section title="지출 추이 비교">
            {result.data.every(r => !r.currentExpense && !r.previousExpense) ? (
              <div className="text-slate-400 text-sm text-center py-10">해당 기간 지출 내역이 없습니다.</div>
            ) : (
              <OverlayChart
                data={result.data} xKey="label"
                currentKey="currentExpense" previousKey="previousExpense"
                currentName={`${result.currentLabel} 지출`} previousName={`${result.previousLabel} 지출`}
                color="#f43f5e" gradientId="cmpExpenseGrad"
              />
            )}
          </Section>

          <Section title="수입 추이 비교">
            {result.data.every(r => !r.currentIncome && !r.previousIncome) ? (
              <div className="text-slate-400 text-sm text-center py-10">해당 기간 수입 내역이 없습니다.</div>
            ) : (
              <OverlayChart
                data={result.data} xKey="label"
                currentKey="currentIncome" previousKey="previousIncome"
                currentName={`${result.currentLabel} 수입`} previousName={`${result.previousLabel} 수입`}
                color="#10b981" gradientId="cmpIncomeGrad"
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
