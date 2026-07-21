import React, { useEffect, useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';

const PALETTE = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
const PERIODS = ['일', '주', '월', '연'];

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function shortFmt(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 10000) return `${Math.round(v / 10000)}만`;
  return v.toLocaleString('ko-KR');
}

function StatCard({ label, value, sub, color = 'text-slate-800' }) {
  return (
    <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
      <p className="text-slate-500 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children, caption }) {
  return (
    <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {caption && <span className="text-xs text-slate-400">{caption}</span>}
      </div>
      {children}
    </div>
  );
}

function yearlyFromMonthly(monthlyTrend) {
  const map = new Map();
  (monthlyTrend || []).forEach(m => {
    const year = m.month.slice(0, 4);
    if (!map.has(year)) map.set(year, { year, income: 0, expense: 0 });
    const y = map.get(year);
    y.income += m.income;
    y.expense += m.expense;
  });
  return [...map.values()];
}

function periodConfig(period, data) {
  switch (period) {
    case '일':
      return { rows: data.dailyTrend || [], xKey: 'date', tick: (v) => v.slice(5).replace('-', '/') };
    case '주':
      return { rows: data.weeklyTrend || [], xKey: 'week', tick: (v) => v.slice(5).replace('-', '/') };
    case '연':
      return { rows: yearlyFromMonthly(data.monthlyTrend), xKey: 'year', tick: (v) => v };
    case '월':
    default:
      return { rows: data.monthlyTrend || [], xKey: 'month', tick: (v) => `${Number(v.slice(5, 7))}월` };
  }
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [totalDebt, setTotalDebt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('월');

  useEffect(() => {
    Promise.all([
      fetch('/api/transactions/summary/dashboard').then(r => r.json()),
      fetch('/api/debts').then(r => r.json()),
    ]).then(([d, debts]) => {
      setData(d);
      setTotalDebt(debts.total_balance || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const netWorthTrend = useMemo(() => {
    if (!data?.monthlyTrend) return [];
    let running = 0;
    return data.monthlyTrend.map(m => {
      running += m.income - m.expense;
      return { month: m.month, net: running };
    });
  }, [data]);

  const debtTrend = useMemo(() => {
    if (!data?.monthlyTrend) return [];
    return data.monthlyTrend.map(m => ({ month: m.month, debt: totalDebt }));
  }, [data, totalDebt]);

  if (loading) return <div className="text-slate-500 text-center py-20">로딩 중...</div>;
  if (!data) return <div className="text-rose-600 text-center py-20">데이터를 불러올 수 없습니다.</div>;

  const { rows: flowRows, xKey: flowXKey, tick: flowTick } = periodConfig(period, data);
  const topCategories = (data.categoryBreakdown || []).slice(0, 5);
  const topMerchants = data.topMerchants || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">{data.thisMonth} 대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="이번달 수입" value={fmt(data.income)} color="text-emerald-600" />
        <StatCard label="이번달 지출" value={fmt(data.expense)} color="text-rose-600" />
        <StatCard
          label="가용 현금"
          value={fmt(data.available)}
          sub={`할부 청구 예정 ${fmt(data.installmentsDue)} 제외`}
          color={data.available >= 0 ? 'text-indigo-600' : 'text-rose-600'}
        />
      </div>

      {/* 지출 분석 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="카테고리별 지출">
          {topCategories.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-10">이번 달 지출 내역이 없습니다.</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie
                    data={data.categoryBreakdown}
                    dataKey="total"
                    nameKey="category"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {data.categoryBreakdown.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 text-xs">
                {data.categoryBreakdown.slice(0, 8).map((c, i) => (
                  <div key={c.category} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-slate-600 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      {c.category}
                    </span>
                    <span className="text-slate-800 font-medium tabular-nums">{fmt(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="예산 대비 실적">
          {(!data.budgets || data.budgets.length === 0) ? (
            <div className="text-slate-400 text-sm text-center py-10">설정된 예산이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {data.budgets.map(b => {
                const pct = Math.min(100, Math.round((b.spent / b.monthly_budget) * 100));
                const over = b.spent > b.monthly_budget;
                return (
                  <div key={b.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">{b.name}</span>
                      <span className={over ? 'text-rose-600' : 'text-slate-600'}>
                        {fmt(b.spent)} / {fmt(b.monthly_budget)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div
                        className={`h-1.5 rounded-full ${over ? 'bg-rose-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* 흐름 분석 */}
      <Section
        title="흐름 분석"
        caption={
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  period === p ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={flowRows}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey={flowXKey} tickFormatter={flowTick} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v) => fmt(v)} labelFormatter={flowTick} />
            <Area type="monotone" dataKey="income" name="수입" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="expense" name="지출" stroke="#f43f5e" fill="url(#expenseGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>

        <div className="mt-5">
          <h3 className="text-xs font-medium text-slate-500 mb-2">일별 지출 (최근 30일)</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data.dailyTrend}>
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5).replace('-', '/')} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="expense" name="지출" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* 자산 흐름 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="순자산 추이" caption="누적 수지 기준">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={netWorthTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(v) => `${Number(v.slice(5, 7))}월`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(v) => `${Number(v.slice(5, 7))}월`} />
              <Line type="monotone" dataKey="net" name="누적 수지" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section title="부채 잔액 추이" caption="현재 총 부채 기준">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={debtTrend}>
              <defs>
                <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e11d48" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#e11d48" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(v) => `${Number(v.slice(5, 7))}월`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(v) => `${Number(v.slice(5, 7))}월`} />
              <Area type="monotone" dataKey="debt" name="총 부채" stroke="#e11d48" fill="url(#debtGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Top 지출 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="이번달 Top 5 가맹점">
          {topMerchants.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6">이번 달 거래 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topMerchants.map((m, i) => (
                <div key={m.merchant} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-medium">{i + 1}</span>
                    {m.merchant}
                  </span>
                  <span className="text-slate-800 font-medium tabular-nums">{fmt(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="이번달 Top 5 카테고리">
          {topCategories.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6">이번 달 지출 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topCategories.map((c, i) => (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-medium">{i + 1}</span>
                    {c.category}
                  </span>
                  <span className="text-slate-800 font-medium tabular-nums">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
