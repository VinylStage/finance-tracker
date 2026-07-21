import React, { useEffect, useState, useCallback } from 'react';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Debts() {
  const [items, setItems] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalInterest, setTotalInterest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/debts').then(r => r.json()).then(d => {
      setItems(d.data || []);
      setTotalBalance(d.total_balance || 0);
      setTotalInterest(d.total_monthly_interest || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (formData) => {
    const method = editItem ? 'PUT' : 'POST';
    const url = editItem ? `/api/debts/${editItem.id}` : '/api/debts';
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
    await fetch(`/api/debts/${id}`, { method: 'DELETE' });
    load();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">부채 현황</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + 부채 추가
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
          <p className="text-slate-500 text-sm mb-1">총 부채</p>
          <p className="text-2xl font-bold text-rose-600">{fmt(totalBalance)}</p>
        </div>
        <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
          <p className="text-slate-500 text-sm mb-1">월이자 합계</p>
          <p className="text-2xl font-bold text-slate-800">{fmt(totalInterest)}</p>
        </div>
      </div>

      {showForm && (
        <DebtForm
          initial={editItem}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-10">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-slate-400 text-center py-10">등록된 부채가 없습니다.</div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-500 font-medium">부채명</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">잔액</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">연이율</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">월이자 (참고)</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium hidden md:table-cell">메모</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => (
                <tr
                  key={d.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                >
                  <td className="px-4 py-3 text-slate-800">{d.name}</td>
                  <td className="px-4 py-3 text-right text-rose-600 font-medium tabular-nums">{fmt(d.balance)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{d.annual_rate}%</td>
                  <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{fmt(d.monthly_interest)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{d.memo || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(d)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors text-xs"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors text-xs"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DebtForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    balance: initial ? String(initial.balance) : '',
    annual_rate: initial ? String(initial.annual_rate) : '',
    memo: initial?.memo || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      balance: Number(form.balance),
      annual_rate: form.annual_rate ? Number(form.annual_rate) : 0,
    });
  };

  const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-600">{initial ? '부채 수정' : '부채 추가'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">부채명 *</label>
          <input type="text" className={inp} value={form.name} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">잔액 (원) *</label>
          <input type="number" className={inp} value={form.balance} onChange={e => set('balance', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">연이율 (%)</label>
          <input type="number" step="0.01" className={inp} placeholder="0" value={form.annual_rate} onChange={e => set('annual_rate', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">메모</label>
          <input type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg transition-colors">
          {initial ? '저장' : '추가'}
        </button>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-slate-800 text-sm px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
