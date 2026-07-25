import React, { useEffect, useState, useMemo } from 'react';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

const today = new Date();
const CURRENT_YEAR = String(today.getFullYear());
const CURRENT_MONTH = `${CURRENT_YEAR}-${String(today.getMonth() + 1).padStart(2, '0')}`;

const EMPTY_FILTERS = { merchant: '', memo: '', minAmount: '', maxAmount: '', paymentMethodId: '' };
const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [categoryFilter, setCategoryFilter] = useState(new Set()); // 비어있으면 전체
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    const [txData, cats, pms] = await Promise.all([
      api.get('/api/transactions?limit=5000'),
      api.get('/api/categories'),
      api.get('/api/payment-methods'),
    ]);
    setTransactions(txData.data || []);
    setCategories(cats);
    setPaymentMethods(pms);
  }, []);

  const years = useMemo(() => {
    const set = new Set(transactions.map(t => t.date.slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  useEffect(() => {
    if (!years.length) return;
    setSelectedYear(prev => (prev && years.includes(prev) ? prev : (years.includes(CURRENT_YEAR) ? CURRENT_YEAR : years[0])));
  }, [years]);

  useEffect(() => { setSelectedIds(new Set()); }, [selectedYear]);

  const matchesFilters = (t) => {
    const { merchant, memo, minAmount, maxAmount, paymentMethodId } = filters;
    if (merchant && !(t.merchant || '').toLowerCase().includes(merchant.toLowerCase())) return false;
    if (memo && !(t.memo || '').toLowerCase().includes(memo.toLowerCase())) return false;
    if (minAmount !== '' && t.amount < Number(minAmount)) return false;
    if (maxAmount !== '' && t.amount > Number(maxAmount)) return false;
    if (paymentMethodId && String(t.payment_method_id) !== paymentMethodId) return false;
    if (categoryFilter.size > 0 && !categoryFilter.has(t.category_id)) return false;
    return true;
  };

  const filtersActive = Object.values(filters).some(v => v !== '') || categoryFilter.size > 0;

  const majorTypes = useMemo(() => [...new Set(categories.map(c => c.major_type))], [categories]);

  const toggleCategoryFilter = (id) => {
    setCategoryFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const monthGroups = useMemo(() => {
    if (!selectedYear) return [];
    const map = new Map();
    transactions
      .filter(t => t.date.slice(0, 4) === selectedYear)
      .filter(matchesFilters)
      .forEach(t => {
        const month = t.date.slice(0, 7);
        if (!map.has(month)) map.set(month, { month, income: 0, expense: 0, count: 0, items: [] });
        const g = map.get(month);
        g.count += 1;
        g.items.push(t);
        if (t.major_type === '수입') g.income += t.amount;
        else if (t.payment_style !== '할부' && t.payment_style !== '리볼빙') g.expense += t.amount;
      });
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [transactions, selectedYear, filters, categoryFilter]);

  useEffect(() => {
    if (!monthGroups.length) return;
    const hasCurrentMonth = monthGroups.some(g => g.month === CURRENT_MONTH);
    setExpandedMonths(new Set([hasCurrentMonth ? CURRENT_MONTH : monthGroups[0].month]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  const toggleMonth = (month) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  };

  const handleSave = async (formData) => {
    try {
      if (editItem) await api.put(`/api/transactions/${editItem.id}`, formData);
      else await api.post('/api/transactions', formData);
      setShowForm(false);
      setEditItem(null);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!await confirm('삭제하시겠습니까?', { tone: 'danger' })) return;
    try {
      await api.del(`/api/transactions/${id}`);
      reload();
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
      reload();
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
            type="text" placeholder="가맹점 검색" className={inp}
            value={filters.merchant} onChange={e => setFilters(f => ({ ...f, merchant: e.target.value }))}
          />
          <input
            type="text" placeholder="메모 검색" className={inp}
            value={filters.memo} onChange={e => setFilters(f => ({ ...f, memo: e.target.value }))}
          />
          <input
            type="number" placeholder="최소 금액" className={inp}
            value={filters.minAmount} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))}
          />
          <input
            type="number" placeholder="최대 금액" className={inp}
            value={filters.maxAmount} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
          />
          <select
            className={inp}
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
        <div className="text-slate-500 text-center py-10">거래 내역이 없습니다.</div>
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
            {monthGroups.map(g => {
              const monthNum = Number(g.month.slice(5, 7));
              const expanded = expandedMonths.has(g.month);
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
                      <TransactionList
                        items={g.items}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        bare
                        selectedIds={selectedIds}
                        onToggleSelect={handleToggleSelect}
                        onToggleSelectAll={handleToggleSelectAll}
                      />
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
