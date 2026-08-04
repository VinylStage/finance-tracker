import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer, Tooltip,
  AreaChart, Area, LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import LoadError from '../components/LoadError';
import CatchupNotice from '../components/CatchupNotice';
import {
  budgetStatus,
  budgetLabel,
  BUDGET_TONE,
  BUDGET_MARK,
  CAUTION_TICK_PCT,
  overflowWidthPx,
} from '../lib/budget';
import CategorySpendSection from '../components/CategorySpendSection';
import SpendHeatmap from '../components/SpendHeatmap';
import YearHeatmap from '../components/YearHeatmap';
import HeatmapPeriodPicker from '../components/HeatmapPeriodPicker';
// 이 파일에 이미 monthRange(offset) 이 있다 — 이번 달 기준 상대 오프셋을 받는
// 다른 함수다. 이름이 겹치므로 별칭을 준다.
import { monthRange as heatMonthRange, bucketToDaily } from '../lib/heatmapPeriod';
import { bucketByDay } from '../lib/dailyBuckets';
import CashFlowBars from '../components/CashFlowBars';

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
      collapsible
      id="category-compare"
      title="카테고리별 지출 비교"
      caption={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {[['this', '이번달'], ['last', '지난달'], ['custom', '기간지정']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setPeriodMode(mode)}
                className={`text-xs px-2.5 py-1 rounded-control transition-colors ${
                  periodMode === mode ? 'bg-brand-tint text-brand-text font-medium' : 'text-caption hover:text-body hover:bg-surface-page'
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
                className={`text-xs px-2.5 py-1 rounded-control transition-colors ${
                  chartType === type ? 'bg-brand-tint text-brand-text font-medium' : 'text-caption hover:text-body hover:bg-surface-page'
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
          <input type="date" aria-label="기간 시작일" className="bg-surface border border-line-strong rounded-control px-2 py-1 text-body" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span className="text-caption">~</span>
          <input type="date" aria-label="기간 종료일" className="bg-surface border border-line-strong rounded-control px-2 py-1 text-body" value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}
      {loading ? (
        <div className="text-caption text-sm text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <div className="text-caption text-sm text-center py-10">해당 기간 지출 내역이 없습니다.</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          {chartType === 'bar' ? (
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} />
              {/* 막대마다 색을 바꾸지 않는다. 카테고리는 X축 라벨이 구분하고,
                  색은 "이 막대가 무엇인지" 가 아니라 "지출 데이터" 라는 한 가지만
                  말한다. 카테고리별 색은 개수가 늘면 반드시 무너진다. */}
              <Bar dataKey="total" name="지출" radius={[3, 3, 0, 0]} fill="var(--color-brand-fill)" />
            </BarChart>
          ) : (
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Line type="monotone" dataKey="total" name="지출" stroke="var(--color-brand-fill)" strokeWidth={2} dot={{ r: 3 }} />
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
      <p className="text-caption text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-caption text-xs mt-1">{sub}</p>}
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
              <span className="text-caption text-xs ml-2">{r.category_name} · 매월 {r.day_of_month}일</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-medium tabular-nums text-body">{fmt(r.amount)}</span>
              <button
                onClick={() => handleConfirm(r.id)}
                disabled={busyId === r.id}
                className="btn-primary text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
              >
                생성
              </button>
              <button
                onClick={() => handleSkip(r.id)}
                disabled={busyId === r.id}
                className="text-caption hover:text-body text-xs px-2 py-1.5"
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

const SECTION_STATE_KEY = 'dash.section.';

// sessionStorage 접근이 막힌 환경(사파리 프라이빗 모드 등)에서도 화면은 떠야 한다.
// 접힘 상태는 편의 기능이라 저장 실패로 렌더를 막을 이유가 없다.
function readSectionOpen(id, fallback) {
  try {
    const v = window.sessionStorage.getItem(SECTION_STATE_KEY + id);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

// collapsible 이 아니면 기존 카드와 동일하게 렌더한다. 접힘 모드일 때만 <details> 를 쓴다.
// <details> 를 고른 이유: 키보드 조작과 스크린리더 상태 노출(expanded/collapsed)을
// 브라우저가 이미 구현해 두고 있어 직접 배선할 필요가 없다.
// 닫혀 있어도 children 은 DOM 에 마운트되므로 각 섹션의 데이터 로딩 훅은 그대로 돈다.
function Section({ title, children, caption, collapsible = false, id, defaultOpen = false }) {
  const [open, setOpen] = useState(() => (collapsible ? readSectionOpen(id, defaultOpen) : true));

  if (!collapsible) {
    return (
      <div className="bg-surface shadow-card rounded-card p-5 border border-line">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-body">{title}</h2>
          {caption && <span className="text-xs text-caption">{caption}</span>}
        </div>
        {children}
      </div>
    );
  }

  const handleToggle = (e) => {
    const next = e.currentTarget.open;
    setOpen(next);
    try {
      window.sessionStorage.setItem(SECTION_STATE_KEY + id, next ? '1' : '0');
    } catch {
      // 저장 실패는 무시한다.
    }
  };

  return (
    <details
      open={open}
      onToggle={handleToggle}
      className="bg-surface shadow-card rounded-card border border-line"
    >
      <summary className="flex items-baseline justify-between gap-2 px-5 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-2">
          <span aria-hidden="true" className="text-caption text-[10px]">{open ? '▼' : '▶'}</span>
          <h2 className="text-sm font-semibold text-body">{title}</h2>
        </span>
        {/* caption 에 기간 선택 버튼 같은 대화형 요소가 들어온다. 클릭이 summary 까지
            올라가면 섹션이 접혔다 펴졌다 하므로 여기서 전파를 끊는다. */}
        {caption && (
          <span className="text-xs text-caption" onClick={(e) => e.stopPropagation()}>
            {caption}
          </span>
        )}
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
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

// 히트맵의 연·월은 **이 그래프 전용 상태**다(#273 A안). 대시보드의 기간 필터와
// 공유하지 않는다 — 전역을 따라가면 "왜 내가 고른 기간이 아닌 게 보이지" 가 된다.
//
// URL 키에 heat 접두를 붙여 다른 화면·컨트롤과 겹치지 않게 한다.
const HEAT_KEYS = { mode: 'heatMode', year: 'heatYear', month: 'heatMonth' };

function readHeatPeriod() {
  const now = new Date();
  const fallback = { mode: 'month', year: now.getFullYear(), month: now.getMonth() + 1 };
  if (typeof window === 'undefined') return fallback;

  const q = new URLSearchParams(window.location.search);
  const mode = q.get(HEAT_KEYS.mode) === 'year' ? 'year' : 'month';
  const year = Number(q.get(HEAT_KEYS.year));
  const month = Number(q.get(HEAT_KEYS.month));
  return {
    mode,
    year: Number.isInteger(year) && year > 1900 ? year : fallback.year,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : fallback.month,
  };
}

// 뷰 전환은 탐색이 아니라 표시 방식 변경이라 뒤로가기 이력을 쌓지 않는다.
function writeHeatPeriod({ mode, year, month }) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set(HEAT_KEYS.mode, mode);
  url.searchParams.set(HEAT_KEYS.year, String(year));
  url.searchParams.set(HEAT_KEYS.month, String(month));
  window.history.replaceState(null, '', url);
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [totalDebt, setTotalDebt] = useState(0);
  const [period, setPeriod] = useState('월');
  const [heatPeriod, setHeatPeriod] = useState(readHeatPeriod);
  const [heatBuckets, setHeatBuckets] = useState(null);

  const { loading, error, reload } = useLoader(async () => {
    const [d, debts] = await Promise.all([
      api.get('/api/transactions/summary/dashboard'),
      api.get('/api/debts'),
    ]);
    setData(d);
    setTotalDebt(debts.total_balance || 0);
  }, []);

  // 선택한 기간의 거래를 따로 조회한다. 기존 dailyTrend 는 최근 30일 고정이라
  // 임의의 달·해를 그릴 수 없다.
  useEffect(() => {
    let cancelled = false;
    const { mode, year, month } = heatPeriod;
    const range = mode === 'year'
      ? { from: `${year}-01-01`, to: `${year}-12-31` }
      : heatMonthRange(year, month);

    setHeatBuckets(null);
    const p = new URLSearchParams({ from: range.from, to: range.to, limit: '500' });
    api.get(`/api/transactions?${p}`).then((res) => {
      if (!cancelled) setHeatBuckets(bucketByDay(res.data || []));
    }).catch(() => {
      if (!cancelled) setHeatBuckets({});
    });
    return () => { cancelled = true; };
  }, [heatPeriod]);

  useEffect(() => { writeHeatPeriod(heatPeriod); }, [heatPeriod]);

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

  if (loading) return <div className="text-caption text-center py-20">로딩 중...</div>;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="text-loss-text text-center py-20">데이터를 불러올 수 없습니다.</div>;

  const { rows: flowRows, xKey: flowXKey, tick: flowTick } = periodConfig(period, data);

  // 히트맵은 이번 달만 그린다. thisMonth 는 'YYYY-MM' 문자열이다.
  const [heatYear, heatMonth] = (data.thisMonth || '').split('-').map(Number);

  // dailyTrend 는 최근 30일이라 이번 달 밖의 날짜도 섞여 있다. 날짜 문자열을 그대로
  // 키로 쓰면 컴포넌트가 이번 달 것만 골라 읽는다.
  const heatDailyTotals = Object.fromEntries(
    (data.dailyTrend || []).map((d) => [d.date, Number(d.expense) || 0])
  );

  // 기준선은 이번 달 예산 합계에서 나온다. 예산이 없으면 컴포넌트가 일평균으로 폴백한다.
  const heatBudgetTotal = (data.budgets || []).reduce(
    (sum, b) => sum + (Number(b.monthly_budget) || 0),
    0
  );

  // 폴백용 일평균. dailyTrend 가 최근 30일이므로 그 지출 합을 날짜 수로 나눈다.
  const heatTrend = data.dailyTrend || [];
  const heatDailyAverage = heatTrend.length
    ? heatTrend.reduce((sum, d) => sum + (Number(d.expense) || 0), 0) / heatTrend.length
    : 0;
  // 하단 「이번달 Top 5 카테고리」 섹션이 쓴다. 파이차트 캡핑(#194)은
  // CategorySpendSection 이 자체적으로 처리하므로 이 변수와 무관하다.
  const topCategories = (data.categoryBreakdown || []).slice(0, 5);
  const topMerchants = data.topMerchants || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">{data.thisMonth} 대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="이번달 수입" value={fmt(data.income)} color="text-brand-text" />
        <StatCard label="이번달 지출" value={fmt(data.expense)} color="text-loss-text" />
        <StatCard
          label="가용 현금"
          value={fmt(data.available)}
          sub={`할부 청구 예정 ${fmt(data.installmentsDue)} 제외`}
          color={data.available >= 0 ? 'text-brand-text' : 'text-loss-text'}
        />
      </div>

      {/* 자동으로 생긴 것을 먼저 알리고, 그다음 확인이 필요한 것을 낸다.
          순서가 반대면 사용자가 "이건 왜 벌써 생겼지" 를 나중에 만난다. */}
      <CatchupNotice />
      <RecurringDueSection onConfirmed={reload} />

      {/* 자금 흐름 — 요약 카드 바로 다음이다. "얼마 벌고 얼마 썼나" 를 본 직후
          "그래서 어디로 갔나" 를 답하는 순서라야 읽는 흐름이 끊기지 않는다. */}
      <Section title="자금 흐름" caption="수입이 어디로 갔나">
        <CashFlowBars rows={data.categoryBreakdown} income={data.income} />
      </Section>

      {/* 지출 분석 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategorySpendSection rows={data.categoryBreakdown} />

        <Section title="예산 대비 실적">
          {(!data.budgets || data.budgets.length === 0) ? (
            <div className="text-caption text-sm text-center py-10">설정된 예산이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {data.budgets.map(b => {
                const s = budgetStatus(b.spent, b.monthly_budget);
                const tone = BUDGET_TONE[s.level];
                const mark = BUDGET_MARK[s.level];
                const overW = overflowWidthPx(s);
                return (
                  <div key={b.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-caption">{b.name}</span>
                      <span className={`font-medium ${tone.text}`}>
                        {mark && <span aria-hidden="true" className="mr-1">{mark}</span>}
                        {budgetLabel(s, fmt)}
                      </span>
                    </div>
                    {/* 초과분은 막대 밖 별도 세그먼트(사선 해치)로 뺀다.
                        막대를 100% 에서 자르면 얼마나 넘었는지 알 수 없다. */}
                    <div className="flex items-center gap-1">
                      <div className="relative h-1.5 flex-1 bg-surface-sunken rounded-bar">
                        <div
                          className={`h-1.5 rounded-bar transition-all ${tone.bar}`}
                          style={{ width: `${s.barPct}%` }}
                        />
                        {/* 80% 임계 눈금. 막대 위아래로 삐져나오게 그려 트랙 위에서도
                            보이게 한다. ink 는 트랙·정상·주의·초과 네 배경 모두에서
                            3:1 을 넘기는 유일한 무채색이다. */}
                        <span
                          aria-hidden="true"
                          className="absolute -top-[3px] h-3 w-px bg-ink"
                          style={{ left: `${CAUTION_TICK_PCT}%` }}
                        />
                      </div>
                      {overW > 0 && (
                        <div
                          aria-hidden="true"
                          className="bar-overflow h-1.5 shrink-0 rounded-bar"
                          style={{ width: `${overW}px` }}
                        />
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-caption tabular-nums">
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
        collapsible
        id="flow"
        title="흐름 분석"
        caption={
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-2.5 py-1 rounded-control transition-colors ${
                  period === p ? 'bg-brand-tint text-brand-text font-medium' : 'text-caption hover:text-body hover:bg-surface-page'
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
            <span className="text-caption">전월 대비</span>
            <span className="text-body">
              수입 <span className="text-brand-text font-medium">{fmt(monthComparison.income.curr)}</span>
              {monthComparison.income.pct !== null && (
                <span className={monthComparison.income.pct >= 0 ? 'text-brand-text' : 'text-loss-text'}>
                  {' '}({monthComparison.income.pct >= 0 ? '+' : ''}{monthComparison.income.pct}%)
                </span>
              )}
            </span>
            <span className="text-body">
              지출 <span className="text-loss-text font-medium">{fmt(monthComparison.expense.curr)}</span>
              {monthComparison.expense.pct !== null && (
                <span className={monthComparison.expense.pct <= 0 ? 'text-brand-text' : 'text-loss-text'}>
                  {' '}({monthComparison.expense.pct >= 0 ? '+' : ''}{monthComparison.expense.pct}%)
                </span>
              )}
            </span>
          </div>
        )}
        {/* 수입과 지출은 답하는 질문이 다르다. 같은 형태로 겹쳐 그리면 서로 가린다. */}
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={flowRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey={flowXKey} tickFormatter={flowTick} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v) => fmt(v)} labelFormatter={flowTick} />
            <Bar dataKey="expense" name="지출" fill="var(--color-loss-fill)" radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="income" name="수입" stroke="var(--color-brand-fill)" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* 일별 지출 강도 히트맵 */}
        <div className="mt-5">
          <h3 className="text-xs font-medium text-caption mb-2">일별 지출 강도</h3>
          <HeatmapPeriodPicker
            mode={heatPeriod.mode}
            year={heatPeriod.year}
            month={heatPeriod.month}
            onChange={setHeatPeriod}
          />
          {heatBuckets === null ? (
            <div className="text-caption text-meta text-center py-6">불러오는 중...</div>
          ) : heatPeriod.mode === 'year' ? (
            <YearHeatmap
              year={heatPeriod.year}
              buckets={heatBuckets}
              monthlyBudgetTotal={heatBudgetTotal}
              recentDailyAverage={heatDailyAverage}
            />
          ) : (
            <SpendHeatmap
              year={heatPeriod.year}
              month={heatPeriod.month}
              dailyTotals={bucketToDaily(heatBuckets, heatPeriod.year, heatPeriod.month)}
              monthlyBudgetTotal={heatBudgetTotal}
              recentDailyAverage={heatDailyAverage}
            />
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-medium text-caption mb-2">일별 지출 (최근 30일)</h3>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data.dailyTrend}>
              <defs>
                <linearGradient id="dailyExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-loss-fill)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-loss-fill)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5).replace('-', '/')} tick={{ fontSize: 10, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 10, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Area type="monotone" dataKey="expense" name="지출" stroke="var(--color-loss-fill)" fill="url(#dailyExpenseGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* 자산 흐름 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Section collapsible id="networth" title="순자산 추이" caption="누적 수지 기준">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={netWorthTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(v) => `${Number(v.slice(5, 7))}월`} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(v) => `${Number(v.slice(5, 7))}월`} />
              <Line type="monotone" dataKey="net" name="누적 수지" stroke="var(--color-brand-fill)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section collapsible id="debt-trend" title="부채 잔액 추이" caption="현재 총 부채 기준">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={debtTrend}>
              <defs>
                <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-loss-fill)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-loss-fill)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(v) => `${Number(v.slice(5, 7))}월`} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: 'var(--color-caption)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(v) => `${Number(v.slice(5, 7))}월`} />
              <Area type="monotone" dataKey="debt" name="총 부채" stroke="var(--color-loss-fill)" fill="url(#debtGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Top 지출 — 접힘 섹션이 섞이므로 items-start 로 각 카드가 자기 높이만 차지하게 한다.
          기본값(stretch)이면 펼친 카드 높이에 맞춰 접힌 카드가 빈 박스로 늘어난다. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Section collapsible id="top-merchants" title="이번달 Top 5 가맹점">
          {topMerchants.length === 0 ? (
            <div className="text-caption text-sm text-center py-6">이번 달 거래 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topMerchants.map((m, i) => (
                <div key={m.merchant} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-body">
                    <span className="w-5 h-5 rounded-full bg-surface-sunken text-caption text-xs flex items-center justify-center font-medium">{i + 1}</span>
                    {m.merchant}
                  </span>
                  <span className="text-ink font-medium tabular-nums">{fmt(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section collapsible id="top-categories" title="이번달 Top 5 카테고리">
          {topCategories.length === 0 ? (
            <div className="text-caption text-sm text-center py-6">이번 달 지출 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topCategories.map((c, i) => (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-body">
                    <span className="w-5 h-5 rounded-full bg-surface-sunken text-caption text-xs flex items-center justify-center font-medium">{i + 1}</span>
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
