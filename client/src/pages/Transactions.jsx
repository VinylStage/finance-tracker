import React, { useEffect, useState, useMemo, useCallback } from 'react';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import EmptyState from '../components/EmptyState';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

const today = new Date();
const CURRENT_YEAR = String(today.getFullYear());
const CURRENT_MONTH = `${CURRENT_YEAR}-${String(today.getMonth() + 1).padStart(2, '0')}`;

const EMPTY_FILTERS = { merchant: '', memo: '', minAmount: '', maxAmount: '', paymentMethodId: '' };
const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

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
  const [years, setYears] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [categoryFilter, setCategoryFilter] = useState(new Set()); // 비어있으면 전체
  const [monthSummaries, setMonthSummaries] = useState([]); // [{month, income, expense, count}] — selectedYear 전체 기준(서버 집계)
  const [monthItems, setMonthItems] = useState({}); // { [month]: { data, total } } — 펼친 달만 보유
  const [autoExpandYear, setAutoExpandYear] = useState(null); // 마지막으로 기본펼침을 적용한 연도
  const [dataVersion, setDataVersion] = useState(0); // 저장/삭제 후 월별요약·항목 재조회 트리거
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    const [yrs, cats, pms] = await Promise.all([
      api.get('/api/transactions/years'),
      api.get('/api/categories'),
      api.get('/api/payment-methods'),
    ]);
    setYears(yrs.data || []);
    setCategories(cats);
    setPaymentMethods(pms);
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
    try {
      if (editItem) await api.put(`/api/transactions/${editItem.id}`, formData);
      else await api.post('/api/transactions', formData);
      setShowForm(false);
      setEditItem(null);
      refreshAfterMutation();
    } catch (err) {
      await alert(err.message);
    }
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
        <h1 className="text-xl font-semibold text-slate-800">거래 내역</h1>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-slate-500">{selectedIds.size}건 선택됨</span>
              <button
                onClick={handleBulkDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                선택 삭제
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-500 hover:text-slate-700 text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                선택 해제
              </button>
            </>
          )}
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + 거래 추가
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">검색·필터</h2>
          {filtersActive && (
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setCategoryFilter(new Set()); }}
              className="text-xs text-indigo-600 hover:text-indigo-700"
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
          <summary className="cursor-pointer text-sm text-slate-600">
            카테고리 {categoryFilter.size > 0 ? `(${categoryFilter.size}개 선택됨)` : '(전체)'}
          </summary>
          <div className="mt-2 flex flex-wrap gap-4">
            {majorTypes.map(mt => (
              <div key={mt}>
                <div className="text-xs text-slate-400 mb-1">{mt}</div>
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {categories.filter(c => c.major_type === mt).map(c => (
                    <label
                      key={c.id}
                      className={`text-xs px-2 py-1 rounded-full border cursor-pointer transition-colors ${
                        categoryFilter.has(c.id)
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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

      {showForm && (
        <TransactionForm
          initial={editItem}
          categories={categories}
          paymentMethods={paymentMethods}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : years.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="아직 거래가 없어요"
          description="첫 거래를 추가하면 이번 달에 얼마를 쓸 수 있는지 대시보드가 알려드려요. 카드사 이용내역 파일을 올려 한 번에 등록할 수도 있습니다."
        />
      ) : (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`text-sm px-4 py-2 rounded-t-md transition-colors border-b-2 -mb-px ${
                  selectedYear === y
                    ? 'border-indigo-600 text-indigo-700 font-medium'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
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
                <div key={g.month} className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggleMonth(g.month)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {selectedYear}년 {monthNum}월
                      <span className="text-slate-400 ml-2 text-xs">{expanded ? '▲' : '▼'}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      수입 <span className="text-emerald-600 font-medium">{fmt(g.income)}</span>
                      {' / '}지출 <span className="text-rose-600 font-medium">{fmt(g.expense)}</span>
                      {' / '}{g.count}건
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-slate-200 p-3">
                      {itemsData ? (
                        <>
                          <TransactionList
                            items={itemsData.data}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            bare
                            selectedIds={selectedIds}
                            onToggleSelect={handleToggleSelect}
                            onToggleSelectAll={handleToggleSelectAll}
                          />
                          {itemsData.total > itemsData.data.length && (
                            <div className="text-xs text-amber-600 pt-2">
                              이 달 거래 {itemsData.total}건 중 {itemsData.data.length}건까지 표시됩니다.
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-slate-400 text-sm text-center py-6">불러오는 중...</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
