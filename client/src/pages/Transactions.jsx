import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import TransactionCalendar from '../components/TransactionCalendar';
import { bucketByDay } from '../lib/dailyBuckets';
import { defaultTxDate } from '../lib/defaultTxDate';
import UndoSnackbar from '../components/UndoSnackbar';
import { formFromTransaction } from '../lib/recurringForm';
import { putRecurringDraft } from '../lib/recurringDraft';
import { formatWon } from '../lib/format';


const today = new Date();
const CURRENT_YEAR = String(today.getFullYear());
const CURRENT_MONTH = `${CURRENT_YEAR}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const CURRENT_DATE = `${CURRENT_MONTH}-${String(today.getDate()).padStart(2, '0')}`;

const EMPTY_FILTERS = { merchant: '', memo: '', minAmount: '', maxAmount: '', paymentMethodId: '' };
const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

// 달력뷰의 뷰 모드와 보고 있는 달은 **이 화면의 상태**다. 대시보드의 기간
// 필터(#272)와 공유하지 않는다 — 거래내역에서 7월을 보다가 대시보드로 돌아갔을 때
// 보던 달이 바뀌어 있으면 안 된다. 키에 tx 접두를 붙여 다른 화면과 겹치지 않게 한다.
const VIEW_KEY = 'txView';
const MONTH_KEY = 'txMonth';

// URL 이 정본이지만, 화면을 떠났다 돌아오면 URL 은 초기화된다(네비게이션 링크가
// 쿼리를 들고 가지 않는다). 그때 마지막으로 보던 뷰를 되살리려고 세션에도 남긴다.
// 세션 저장소라 탭을 닫으면 사라진다 — 영구 설정이 아니라 "방금 보던 상태"다.
const STORE_KEY = 'tx.view';

function readStore() {
  try {
    return JSON.parse(window.sessionStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return null;
  }
}

function readViewParams() {
  if (typeof window === 'undefined') return { view: 'list', month: CURRENT_MONTH };
  const q = new URLSearchParams(window.location.search);
  // URL 에 명시된 값이 세션 기억보다 우선한다 — 링크를 받아 연 사람이 그 링크대로 봐야 한다.
  if (q.has(VIEW_KEY)) {
    return {
      view: q.get(VIEW_KEY) === 'calendar' ? 'calendar' : 'list',
      month: /^\d{4}-\d{2}$/.test(q.get(MONTH_KEY) || '') ? q.get(MONTH_KEY) : CURRENT_MONTH,
    };
  }
  const saved = readStore();
  if (saved && saved.view === 'calendar' && /^\d{4}-\d{2}$/.test(saved.month || '')) {
    return { view: 'calendar', month: saved.month };
  }
  return { view: 'list', month: CURRENT_MONTH };
}

// 뒤로가기가 뷰 전환까지 되짚지 않도록 replaceState 를 쓴다. 뷰 토글은 탐색이
// 아니라 표시 방식 변경이다.
function writeViewParams(view, month) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ view, month }));
  } catch {
    // 세션 저장소를 못 쓰는 환경이어도 URL 동기화는 계속돼야 한다.
  }
  const url = new URL(window.location.href);
  if (view === 'calendar') {
    url.searchParams.set(VIEW_KEY, 'calendar');
    url.searchParams.set(MONTH_KEY, month);
  } else {
    url.searchParams.delete(VIEW_KEY);
    url.searchParams.delete(MONTH_KEY);
  }
  window.history.replaceState(null, '', url);
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// FND-02(감사): 이전엔 화면이 최대 5000건을 요청해도 서버가 500건으로 잘라
// 검색·월별합계·연도탭이 최신 500건 범위 안에서만 맞았다. 검색·집계를 전부
// 서버 파라미터로 넘기도록 바꿔, 화면에 보이는 합계/탭이 항상 전체 데이터
// 기준이 되게 한다(근본 해결, 감사 수정방향 A안).
function buildFilterParams(filters, categoryFilter) {
  const params = new URLSearchParams();
  if (filters.merchant) params.set('merchant', filters.merchant);
  if (filters.memo) params.set('memo', filters.memo);
  if (filters.minAmount !== '') params.set('min_amount', filters.minAmount);
  if (filters.maxAmount !== '') params.set('max_amount', filters.maxAmount);
  if (filters.paymentMethodId) params.set('payment_method_id', filters.paymentMethodId);
  if (categoryFilter.size > 0) params.set('category_id', [...categoryFilter].join(','));
  return params;
}

export default function Transactions() {
  const [, navigate] = useLocation();
  const [years, setYears] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [cardProducts, setCardProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [categoryFilter, setCategoryFilter] = useState(new Set()); // 비어있으면 전체
  const [monthSummaries, setMonthSummaries] = useState([]); // [{month, income, expense, count}] — selectedYear 전체 기준(서버 집계)
  const [monthItems, setMonthItems] = useState({}); // { [month]: { data, total } } — 펼친 달만 보유
  const [autoExpandYear, setAutoExpandYear] = useState(null); // 마지막으로 기본펼침을 적용한 연도
  const [dataVersion, setDataVersion] = useState(0); // 저장/삭제 후 월별요약·항목 재조회 트리거
  const [viewMode, setViewMode] = useState(() => readViewParams().view);
  const [calendarMonth, setCalendarMonth] = useState(() => readViewParams().month);
  const [calendarItems, setCalendarItems] = useState(null); // { data, total } — 달력뷰가 보는 달
  const [selectedDay, setSelectedDay] = useState(null);
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    // 카드상품은 결제수단 선택지의 일부다(#302). 보조 정보가 아니라서 화면
    // 로더에 함께 태운다 — 조용히 실패하면 카드가 목록에서 통째로 빠진다.
    const [yrs, cats, pms, cards] = await Promise.all([
      api.get('/api/transactions/years'),
      api.get('/api/categories'),
      api.get('/api/payment-methods'),
      // 비활성 카드까지 받는다. 과거 거래가 그 카드를 가리킬 수 있고, 목록에
      // 없으면 수정 화면이 선택을 비워 저장 시 지정이 지워진다(#410).
      api.get('/api/card-products?include_inactive=1'),
    ]);
    setYears(yrs.data || []);
    setCategories(cats);
    setPaymentMethods(pms);
    setCardProducts(cards.data || []);
  }, []);

  useEffect(() => {
    if (!years.length) return;
    setSelectedYear(prev => (prev && years.includes(prev) ? prev : (years.includes(CURRENT_YEAR) ? CURRENT_YEAR : years[0])));
  }, [years]);

  useEffect(() => { setSelectedIds(new Set()); }, [selectedYear]);

  const filtersActive = Object.values(filters).some(v => v !== '') || categoryFilter.size > 0;

  const majorTypes = useMemo(() => [...new Set(categories.map(c => c.major_type))], [categories]);

  const toggleCategoryFilter = (id) => {
    setCategoryFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 선택한 연도의 월별 수입/지출/건수 요약(서버 GROUP BY, 필터 반영, 전체 데이터 기준)
  useEffect(() => {
    if (!selectedYear) { setMonthSummaries([]); return; }
    let cancelled = false;
    const params = buildFilterParams(filters, categoryFilter);
    params.set('year', selectedYear);
    api.get(`/api/transactions/summary/by-month?${params}`).then(res => {
      if (cancelled) return;
      const rows = res.data || [];
      setMonthSummaries(rows);
      // 연도가 바뀐 뒤 처음 도착한 요약에서만 기본 펼침을 적용한다 — 검색어
      // 입력 등으로 같은 연도의 요약이 다시 갱신될 때마다 사용자가 펼친/접은
      // 상태가 도로 초기화되면 안 되므로.
      if (autoExpandYear !== selectedYear) {
        const hasCurrentMonth = rows.some(g => g.month === CURRENT_MONTH);
        setExpandedMonths(new Set(rows.length ? [hasCurrentMonth ? CURRENT_MONTH : rows[0].month] : []));
        setAutoExpandYear(selectedYear);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, filters, categoryFilter, dataVersion]);

  // 펼쳐진 달의 실제 거래 목록(필터 반영). 접힌 달은 불러오지 않는다.
  useEffect(() => {
    let cancelled = false;
    const months = [...expandedMonths];
    if (!months.length) { setMonthItems({}); return; }
    (async () => {
      const params = buildFilterParams(filters, categoryFilter);
      const entries = await Promise.all(months.map(async (month) => {
        const p = new URLSearchParams(params);
        p.set('from', `${month}-01`);
        p.set('to', `${month}-31`); // 문자열 비교라 실제 일수와 무관하게 그 달 전체를 안전하게 포함
        p.set('limit', '500');
        const res = await api.get(`/api/transactions?${p}`);
        return [month, res];
      }));
      if (cancelled) return;
      const next = {};
      entries.forEach(([month, res]) => { next[month] = res; });
      setMonthItems(next);
    })();
    return () => { cancelled = true; };
  }, [expandedMonths, filters, categoryFilter, dataVersion]);

  // 달력뷰가 보는 달의 거래. 목록뷰의 monthItems 와 별도로 둔다 — 두 뷰가 서로
  // 다른 달을 볼 수 있고, 한쪽 상태가 다른 쪽을 덮어쓰면 안 된다.
  useEffect(() => {
    if (viewMode !== 'calendar') return;
    let cancelled = false;
    const p = buildFilterParams(filters, categoryFilter);
    p.set('from', `${calendarMonth}-01`);
    p.set('to', `${calendarMonth}-31`);
    p.set('limit', '500');
    setCalendarItems(null);
    api.get(`/api/transactions?${p}`).then((res) => {
      if (!cancelled) setCalendarItems(res);
    });
    return () => { cancelled = true; };
  }, [viewMode, calendarMonth, filters, categoryFilter, dataVersion]);

  useEffect(() => { writeViewParams(viewMode, calendarMonth); }, [viewMode, calendarMonth]);

  // 달을 옮기면 그 달에 없는 날짜가 선택된 채 남는다.
  useEffect(() => { setSelectedDay(null); }, [calendarMonth]);

  const calendarBuckets = useMemo(
    () => bucketByDay(calendarItems?.data || []),
    [calendarItems]
  );

  const selectedDayItems = useMemo(
    () => (selectedDay ? (calendarItems?.data || []).filter((t) => t.date === selectedDay) : []),
    [selectedDay, calendarItems]
  );

  // 보고 있던 화면이 아는 날짜를 폼 기본값으로 넘긴다(#304).
  //
  // 달력뷰에서 고른 날짜 > 목록뷰에서 펼친 달 > 오늘 순이다. 상태는 이 방향으로만
  // 흐른다 — 폼에서 날짜를 바꿔도 목록 펼침이나 달력 월은 움직이지 않는다.
  const formDefaultDate = useMemo(
    () => defaultTxDate({
      // 달력뷰를 보고 있을 때만 선택 날짜가 의미를 갖는다. 목록뷰로 돌아온 뒤
      // 남아 있는 선택이 기본값을 잡으면 사용자가 예측할 수 없다.
      selectedDay: viewMode === 'calendar' ? selectedDay : null,
      expandedMonths: [...expandedMonths],
      today: CURRENT_DATE,
    }),
    [viewMode, selectedDay, expandedMonths]
  );

  const toggleMonth = (month) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  };

  const refreshAfterMutation = useCallback(() => {
    reload();
    setDataVersion(v => v + 1);
  }, [reload]);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (editItem) await api.put(`/api/transactions/${editItem.id}`, formData);
      else await api.post('/api/transactions', formData);
      setShowForm(false);
      setEditItem(null);
      refreshAfterMutation();
    } catch (err) {
      await alert(err.message);
    } finally {
      // 실패해도 반드시 풀어야 한다. 안 그러면 모달이 영영 닫히지 않는다.
      setSaving(false);
    }
  };

  // 거래를 반복 규칙의 템플릿으로 넘긴다(#280). 값은 세션 저장소로 넘긴다 —
  // 쿼리 문자열로 넘기면 가맹점·메모가 주소창과 방문 기록에 남는다.
  const handleMakeRecurring = (tx) => {
    putRecurringDraft(formFromTransaction(tx));
    navigate('/settings#recurring');
  };

  const handleDelete = async (id) => {
    if (!await confirm('삭제하시겠습니까?', { tone: 'danger' })) return;
    try {
      await api.del(`/api/transactions/${id}`);
      refreshAfterMutation();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (ids, select) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => { if (select) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까? 되돌릴 수 없습니다.`, { tone: 'danger' })) return;
    try {
      await api.del('/api/transactions', { ids: [...selectedIds] });
      setSelectedIds(new Set());
      refreshAfterMutation();
    } catch (err) {
      await alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-ink">거래 내역</h1>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-caption">{selectedIds.size}건 선택됨</span>
              <button
                onClick={handleBulkDelete}
                className="btn-danger text-sm px-4 py-2 rounded-control transition-colors"
              >
                선택 삭제
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-caption hover:text-body text-sm px-3 py-2 rounded-control border border-line hover:bg-surface-page transition-colors"
              >
                선택 해제
              </button>
            </>
          )}
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="btn-primary text-sm px-4 py-2 rounded-control transition-colors"
          >
            + 거래 추가
          </button>
        </div>
      </div>

      <div className="bg-surface shadow-card rounded-card border border-line p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-body">검색·필터</h2>
          {filtersActive && (
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setCategoryFilter(new Set()); }}
              className="text-xs text-brand-text hover:text-brand-text"
            >
              필터 초기화
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <input
            type="text" placeholder="가맹점 검색" aria-label="가맹점 검색" className={inp}
            value={filters.merchant} onChange={e => setFilters(f => ({ ...f, merchant: e.target.value }))}
          />
          <input
            type="text" placeholder="메모 검색" aria-label="메모 검색" className={inp}
            value={filters.memo} onChange={e => setFilters(f => ({ ...f, memo: e.target.value }))}
          />
          <input
            type="number" placeholder="최소 금액" aria-label="최소 금액" className={inp}
            value={filters.minAmount} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))}
          />
          <input
            type="number" placeholder="최대 금액" aria-label="최대 금액" className={inp}
            value={filters.maxAmount} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
          />
          <select
            aria-label="결제수단 필터" className={inp}
            value={filters.paymentMethodId} onChange={e => setFilters(f => ({ ...f, paymentMethodId: e.target.value }))}
          >
            <option value="">결제수단 전체</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-body">
            카테고리 {categoryFilter.size > 0 ? `(${categoryFilter.size}개 선택됨)` : '(전체)'}
          </summary>
          <div className="mt-2 flex flex-wrap gap-4">
            {majorTypes.map(mt => (
              <div key={mt}>
                <div className="text-xs text-caption mb-1">{mt}</div>
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {categories.filter(c => c.major_type === mt).map(c => (
                    <label
                      key={c.id}
                      className={`text-xs px-2 py-1 rounded-full border cursor-pointer transition-colors ${
                        categoryFilter.has(c.id)
                          ? 'bg-brand-tint border-brand-tint-strong text-brand-text'
                          : 'border-line text-body hover:bg-surface-page'
                      }`}
                    >
                      <input
                        type="checkbox" className="hidden"
                        checked={categoryFilter.has(c.id)} onChange={() => toggleCategoryFilter(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* 쓰기가 끝날 때마다 되돌릴 것이 있는지 묻는다(#301). dataVersion 은
          저장·삭제 성공 시에만 증가하므로 그대로 트리거가 된다. */}
      <UndoSnackbar trigger={dataVersion} onUndone={refreshAfterMutation} />

      {showForm && (
        <Modal
          title={editItem ? '거래 수정' : '새 거래 추가'}
          busy={saving}
          onClose={() => { setShowForm(false); setEditItem(null); }}
        >
          <TransactionForm
            initial={editItem}
            defaultDate={formDefaultDate}
            categories={categories}
            paymentMethods={paymentMethods}
            cardProducts={cardProducts}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditItem(null); }}
          />
        </Modal>
      )}

      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : years.length === 0 ? (
        <EmptyState
          icon={<Icon name="receipt_long" size={32} />}
          title="아직 거래가 없어요"
          description="첫 거래를 추가하면 이번 달에 얼마를 쓸 수 있는지 대시보드가 알려드려요. 카드사 이용내역 파일을 올려 한 번에 등록할 수도 있습니다."
        />
      ) : (
        <>
          <div className="flex justify-end gap-1" role="group" aria-label="보기 방식">
            {[['list', '목록'], ['calendar', '달력']].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`text-xs px-3 py-1 rounded-chip border transition-colors ${
                  viewMode === mode
                    ? 'bg-brand-tint border-brand-tint-strong text-brand-text'
                    : 'border-line text-caption hover:bg-surface-page'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {viewMode === 'calendar' ? (
            <div className="bg-surface shadow-card rounded-card border border-line p-4">
              <TransactionCalendar
                year={Number(calendarMonth.slice(0, 4))}
                month={Number(calendarMonth.slice(5, 7))}
                buckets={calendarBuckets}
                selectedDay={selectedDay}
                onPrev={() => setCalendarMonth(m => shiftMonth(m, -1))}
                onNext={() => setCalendarMonth(m => shiftMonth(m, 1))}
                onSelectDay={(day) => setSelectedDay(d => (d === day ? null : day))}
              />

              {calendarItems === null ? (
                <div className="text-caption text-sm text-center py-6">불러오는 중...</div>
              ) : calendarItems.data.length === 0 ? (
                <div className="text-caption text-sm text-center py-6">
                  이 달에는 거래가 없어요.
                </div>
              ) : selectedDay ? (
                <div className="border-t border-line pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-ink">
                      {Number(selectedDay.slice(5, 7))}월 {Number(selectedDay.slice(8, 10))}일
                      <span className="text-xs text-caption ml-2">{selectedDayItems.length}건</span>
                    </div>
                    {/* 날짜를 이미 골라놓은 자리다. 여기서 추가하면 더 정할 게 없다(#304). */}
                    <button
                      type="button"
                      onClick={() => { setEditItem(null); setShowForm(true); }}
                      className="text-xs px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-page"
                    >
                      이 날짜로 추가
                    </button>
                  </div>
                  <TransactionList
                    items={selectedDayItems}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onMakeRecurring={handleMakeRecurring}
                    bare
                  />
                </div>
              ) : (
                <div className="text-caption text-sm text-center py-4 border-t border-line mt-3">
                  날짜를 누르면 그날 거래가 나와요.
                </div>
              )}

              {calendarItems && calendarItems.total > calendarItems.data.length && (
                <div className="text-xs text-caption pt-2">
                  이 달 거래 {calendarItems.total}건 중 {calendarItems.data.length}건까지 반영됩니다.
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="flex gap-1 border-b border-line">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`text-sm px-4 py-2 rounded-t-md transition-colors border-b-2 -mb-px ${
                  selectedYear === y
                    ? 'border-brand-fill text-brand-text font-medium'
                    : 'border-transparent text-caption hover:text-ink'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {monthSummaries.map(g => {
              const monthNum = Number(g.month.slice(5, 7));
              const expanded = expandedMonths.has(g.month);
              const itemsData = monthItems[g.month];
              return (
                <div key={g.month} className="bg-surface shadow-card rounded-card border border-line overflow-hidden">
                  <button
                    onClick={() => toggleMonth(g.month)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-page transition-colors text-left"
                  >
                    <span className="text-sm font-semibold text-ink">
                      {selectedYear}년 {monthNum}월
                      <span className="text-caption ml-2 text-xs">{expanded ? '▲' : '▼'}</span>
                    </span>
                    <span className="text-xs text-caption">
                      수입 <span className="text-brand-text font-medium">{formatWon(g.income)}</span>
                      {' / '}지출 <span className="text-loss-text font-medium">{formatWon(g.expense)}</span>
                      {' / '}{g.count}건
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-line p-3">
                      {/* 펼친 달이 곧 사용자가 보고 있는 기간이다. 여기서 추가하면
                          그 달 기준 날짜가 기본값으로 들어간다(#304). */}
                      <div className="flex justify-end mb-2">
                        <button
                          type="button"
                          onClick={() => { setEditItem(null); setShowForm(true); }}
                          className="text-xs px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-page"
                        >
                          {monthNum}월에 거래 추가
                        </button>
                      </div>
                      {itemsData ? (
                        <>
                          <TransactionList
                            items={itemsData.data}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onMakeRecurring={handleMakeRecurring}
                            bare
                            selectedIds={selectedIds}
                            onToggleSelect={handleToggleSelect}
                            onToggleSelectAll={handleToggleSelectAll}
                          />
                          {itemsData.total > itemsData.data.length && (
                            <div className="text-xs text-caption pt-2">
                              이 달 거래 {itemsData.total}건 중 {itemsData.data.length}건까지 표시됩니다.
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-caption text-sm text-center py-6">불러오는 중...</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}
