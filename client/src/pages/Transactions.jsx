import React, { useEffect, useState, useCallback, useMemo } from 'react';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

const today = new Date();
const CURRENT_YEAR = String(today.getFullYear());
const CURRENT_MONTH = `${CURRENT_YEAR}-${String(today.getMonth() + 1).padStart(2, '0')}`;

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState(new Set());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/transactions?limit=5000').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/payment-methods').then(r => r.json()),
    ]).then(([txData, cats, pms]) => {
      setTransactions(txData.data || []);
      setCategories(cats);
      setPaymentMethods(pms);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => {
    const set = new Set(transactions.map(t => t.date.slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  useEffect(() => {
    if (!years.length) return;
    setSelectedYear(prev => (prev && years.includes(prev) ? prev : (years.includes(CURRENT_YEAR) ? CURRENT_YEAR : years[0])));
  }, [years]);

  const monthGroups = useMemo(() => {
    if (!selectedYear) return [];
    const map = new Map();
    transactions
      .filter(t => t.date.slice(0, 4) === selectedYear)
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
  }, [transactions, selectedYear]);

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
    const method = editItem ? 'PUT' : 'POST';
    const url = editItem ? `/api/transactions/${editItem.id}` : '/api/transactions';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setShowForm(false);
    setEditItem(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    load();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">거래 내역</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + 거래 추가
        </button>
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
                      <TransactionList items={g.items} onEdit={handleEdit} onDelete={handleDelete} bare />
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
