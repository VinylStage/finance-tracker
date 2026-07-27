import React, { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import LoadError from '../components/LoadError';
import { budgetStatus, budgetLabel, BUDGET_TONE } from '../lib/budget';
import { PALETTE } from '../lib/categoryChart';
import CategorySpendSection from '../components/CategorySpendSection';

const PERIODS = ['일', '주', '월', '연'];

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function shortFmt(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 10000) return `${Math.round(v / 10000)}만`;
  return v.toLocaleString('ko-KR');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function monthRange(offset) {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const from = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const isCurrent = offset === 0;
  const to = isCurrent
    ? localYMD(today)
    : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(lastDay)}`;
  return { from, to };
}

function CategoryComparison() {
  const [periodMode, setPeriodMode] = useState('this');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartType, setChartType] = useState('bar');
  const [rows, setRows] = useState([]);

  const range = useMemo(() => {
    if (periodMode === 'this') return monthRange(0);
    if (periodMode === 'last') return monthRange(-1);
    return { from: customFrom, to: customTo };
  }, [periodMode, customFrom, customTo]);

  const { loading, error, reload } = useLoader(async () => {
    if (!range.from || !range.to) { setRows([]); return; }
    const d = await api.get(`/api/transactions/summary/category-breakdown?from=${range.from}&to=${range.to}`);
    setRows(d.data || []);
  }, [range]);

  return (
    <Section
      title="카테고리별 지출 비교"
      caption={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {[['this', '이번달'], ['last', '지난달'], ['custom', '기간지정']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setPeriodMode(mode)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  periodMode === mode ? 'bg-accent-soft text-accent-strong font-medium' : 'text-ink-faint hover:text-ink-body hover:bg-surface-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 border-l border-line pl-3">
            {[['bar', '막대'], ['line', '라인']].map(([type, label]) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  chartType === type ? 'bg-accent-soft text-accent-strong font-medium' : 'text-ink-faint hover:text-ink-body hover:bg-surface-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {periodMode === 'custom' && (
        <div className="flex items-center gap-2 mb-4 text-xs">
          <input type="date" aria-label="기간 시작일" className="bg-surface border border-line-strong rounded-lg px-2 py-1 text-ink-body" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span className="text-ink-faint">~</span>
          <input type="date" aria-label="기간 종료일" className="bg-surface border border-line-strong rounded-lg px-2 py-1 text-ink-body" value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}
      {loading ? (
        <div className="text-ink-faint text-sm text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <div className="text-ink-faint text-sm text-center py-10">해당 기간 지출 내역이 없습니다.</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          {chartType === 'bar' ? (
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="total" name="지출" radius={[3, 3, 0, 0]}>
                {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Line type="monotone" dataKey="total" name="지출" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </Section>
  );
}

function StatCard({ label, value, sub, color = 'text-ink' }) {
  return (
    <div className="bg-surface shadow-card rounded-card p-5 border border-line">
      <p className="text-ink-subtle text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-ink-subtle text-xs mt-1">{sub}</p>}
    </div>
  );
}

function RecurringDueSection({ onConfirmed }) {
  const [due, setDue] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const { loading, reload } = useLoader(async () => {
    const d = await api.get('/api/recurring-rules/due');
    setDue(d.data || []);
  }, []);

  if (loading || due.length === 0) return null;

  const handleConfirm = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/api/recurring-rules/${id}/confirm`, {});
      await Promise.all([reload(), onConfirmed()]);
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/api/recurring-rules/${id}/skip`, {});
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section title="이번 달 반복 거래 확인" caption={`${due.length}건`}>
      <div className="space-y-2">
        {due.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 text-sm py-1.5">
            <div className="min-w-0">
              <span className="text-ink">{r.merchant}</span>
              <span className="text-ink-faint text-xs ml-2">{r.category_name} · 매월 {r.day_of_month}일</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-medium tabular-nums text-ink-body">{fmt(r.amount)}</span>
              <button
                onClick={() => handleConfirm(r.id)}
                disabled={busyId === r.id}
                className="bg-accent hover:bg-accent-strong text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                생성
              </button>
              <button
                onClick={() => handleSkip(r.id)}
                disabled={busyId === r.id}
                className="text-ink-faint hover:text-ink-body text-xs px-2 py-1.5"
              >
                건너뛰기
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Section({ title, children, caption }) {
  return (
    <div className="bg-surface shadow-card rounded-card p-5 border border-line">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-ink-body">{title}</h2>
        {caption && <span className="text-xs text-ink-faint">{caption}</span>}
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
  const [period, setPeriod] = useState('월');

  const { loading, error, reload } = useLoader(async () => {
    const [d, debts] = await Promise.all([
      api.get('/api/transactions/summary/dashboard'),
      api.get('/api/debts'),
    ]);
    setData(d);
    setTotalDebt(debts.total_balance || 0);
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

  const monthComparison = useMemo(() => {
    const mt = data?.monthlyTrend;
    if (!mt || mt.length < 2) return null;
    const curr = mt[mt.length - 1];
    const prev = mt[mt.length - 2];
    const pctDelta = (a, b) => (b === 0 ? null : Math.round(((a - b) / b) * 100));
    return {
      income: { curr: curr.income, prev: prev.income, pct: pctDelta(curr.income, prev.income) },
      expense: { curr: curr.expense, prev: prev.expense, pct: pctDelta(curr.expense, prev.expense) },
    };
  }, [data]);

  if (loading) return <div className="text-ink-subtle text-center py-20">로딩 중...</div>;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="text-expense text-center py-20">데이터를 불러올 수 없습니다.</div>;

  const { rows: flowRows, xKey: flowXKey, tick: flowTick } = periodConfig(period, data);
  // 하단 「이번달 Top 5 카테고리」 섹션이 쓴다. 파이차트 캡핑(#194)은
  // CategorySpendSection 이 자체적으로 처리하므로 이 변수와 무관하다.
  const topCategories = (data.categoryBreakdown || []).slice(0, 5);
  const topMerchants = data.topMerchants || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">{data.thisMonth} 대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="이번달 수입" value={fmt(data.income)} color="text-income" />
        <StatCard label="이번달 지출" value={fmt(data.expense)} color="text-expense" />
        <StatCard
          label="가용 현금"
          value={fmt(data.available)}
          sub={`할부 청구 예정 ${fmt(data.installmentsDue)} 제외`}
          color={data.available >= 0 ? 'text-accent' : 'text-expense'}
        />
      </div>

      <RecurringDueSection onConfirmed={reload} />

      {/* 지출 분석 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategorySpendSection rows={data.categoryBreakdown} />

        <Section title="예산 대비 실적">
          {(!data.budgets || data.budgets.length === 0) ? (
            <div className="text-ink-faint text-sm text-center py-10">설정된 예산이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {data.budgets.map(b => {
                const s = budgetStatus(b.spent, b.monthly_budget);
                const tone = BUDGET_TONE[s.level];
                return (
                  <div key={b.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-ink-subtle">{b.name}</span>
                      <span className={`font-medium ${tone.text}`}>
                        {budgetLabel(s, fmt)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-sunken rounded-full">
                      <div
                        className={`h-1.5 rounded-full transition-all ${tone.bar}`}
                        style={{ width: `${s.barPct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-ink-faint tabular-nums">
                      {fmt(b.spent)} / {fmt(b.monthly_budget)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <CategoryComparison />

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
                  period === p ? 'bg-accent-soft text-accent-strong font-medium' : 'text-ink-faint hover:text-ink-body hover:bg-surface-muted'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      >
        {monthComparison && (
          <div className="flex flex-wrap gap-4 mb-4 text-xs">
            <span className="text-ink-faint">전월 대비</span>
            <span className="text-ink-muted">
              수입 <span className="text-income font-medium">{fmt(monthComparison.income.curr)}</span>
              {monthComparison.income.pct !== null && (
                <span className={monthComparison.income.pct >= 0 ? 'text-income' : 'text-expense'}>
                  {' '}({monthComparison.income.pct >= 0 ? '+' : ''}{monthComparison.income.pct}%)
                </span>
              )}
            </span>
            <span className="text-ink-muted">
              지출 <span className="text-expense font-medium">{fmt(monthComparison.expense.curr)}</span>
              {monthComparison.expense.pct !== null && (
                <span className={monthComparison.expense.pct <= 0 ? 'text-income' : 'text-expense'}>
                  {' '}({monthComparison.expense.pct >= 0 ? '+' : ''}{monthComparison.expense.pct}%)
                </span>
              )}
            </span>
          </div>
        )}
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
          <h3 className="text-xs font-medium text-ink-subtle mb-2">일별 지출 (최근 30일)</h3>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data.dailyTrend}>
              <defs>
                <linearGradient id="dailyExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5).replace('-', '/')} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Area type="monotone" dataKey="expense" name="지출" stroke="#f43f5e" fill="url(#dailyExpenseGrad)" strokeWidth={2} />
            </AreaChart>
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
            <div className="text-ink-faint text-sm text-center py-6">이번 달 거래 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topMerchants.map((m, i) => (
                <div key={m.merchant} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span className="w-5 h-5 rounded-full bg-surface-sunken text-ink-subtle text-xs flex items-center justify-center font-medium">{i + 1}</span>
                    {m.merchant}
                  </span>
                  <span className="text-ink font-medium tabular-nums">{fmt(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="이번달 Top 5 카테고리">
          {topCategories.length === 0 ? (
            <div className="text-ink-faint text-sm text-center py-6">이번 달 지출 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topCategories.map((c, i) => (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span className="w-5 h-5 rounded-full bg-surface-sunken text-ink-subtle text-xs flex items-center justify-center font-medium">{i + 1}</span>
                    {c.category}
                  </span>
                  <span className="text-ink font-medium tabular-nums">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
