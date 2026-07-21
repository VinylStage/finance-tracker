import React, { useEffect, useState, useCallback } from 'react';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Savings() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/savings').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([s, cats]) => {
      setItems(s.data || []);
      setCategories((cats || []).filter(c => c.major_type === '저축'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (formData) => {
    const method = editItem ? 'PUT' : 'POST';
    const url = editItem ? `/api/savings/${editItem.id}` : '/api/savings';
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
    await fetch(`/api/savings/${id}`, { method: 'DELETE' });
    load();
  };

  const handleMature = async (item) => {
    if (!confirm(`"${item.name}" 만기 처리하시겠습니까? 원금 회수 + 이자가 거래 내역에 자동 기록됩니다.`)) return;
    const r = await fetch(`/api/savings/${item.id}/mature`, { method: 'POST' });
    const body = await r.json();
    if (!r.ok) { alert(body.error || '처리 실패'); return; }
    alert(`만기 처리 완료\n원금: ${fmt(body.principal)}\n이자: ${fmt(body.interest)}\n총 수령액: ${fmt(body.payout)}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">적금 / 저축성보험</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + 상품 등록
        </button>
      </div>

      {showForm && (
        <SavingsForm
          initial={editItem}
          categories={categories}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-10">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-slate-400 text-center py-10">등록된 상품이 없습니다.</div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-500 font-medium">상품명</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">월 납입액</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium hidden sm:table-cell">시작일</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium hidden sm:table-cell">만기일</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">예상 수령액</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                  <td className="px-4 py-3 text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmt(s.monthly_contribution)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{s.start_date}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{s.maturity_date || '—'}</td>
                  <td className="px-4 py-3 text-right text-indigo-600 font-medium tabular-nums">{s.expected_payout ? fmt(s.expected_payout) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${s.status === '진행중' ? 'text-indigo-600' : 'text-slate-400'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end flex-wrap">
                      {s.status === '진행중' && (
                        <button onClick={() => handleMature(s)} className="text-slate-400 hover:text-emerald-600 transition-colors text-xs">만기처리</button>
                      )}
                      <button onClick={() => { setEditItem(s); setShowForm(true); }} className="text-slate-400 hover:text-indigo-600 transition-colors text-xs">수정</button>
                      <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-rose-600 transition-colors text-xs">삭제</button>
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

function SavingsForm({ initial, categories, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: initial?.name || '',
    monthly_contribution: initial ? String(initial.monthly_contribution) : '',
    start_date: initial?.start_date || today,
    maturity_date: initial?.maturity_date || '',
    expected_payout: initial ? String(initial.expected_payout || '') : '',
    category_id: initial?.category_id ? String(initial.category_id) : '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      monthly_contribution: Number(form.monthly_contribution),
      expected_payout: form.expected_payout ? Number(form.expected_payout) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
    });
  };

  const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-600">{initial ? '상품 수정' : '상품 등록'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">상품명 *</label>
          <input type="text" className={inp} value={form.name} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">월 납입액 (원) *</label>
          <input type="number" className={inp} value={form.monthly_contribution} onChange={e => set('monthly_contribution', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">시작일 *</label>
          <input type="date" className={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">만기일</label>
          <input type="date" className={inp} value={form.maturity_date} onChange={e => set('maturity_date', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">예상 수령액 (원)</label>
          <input type="number" className={inp} placeholder="원금+이자" value={form.expected_payout} onChange={e => set('expected_payout', e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs text-slate-500 mb-1">저축 카테고리 (만기 시 원금 회수 기록에 사용)</label>
          <select className={inp} value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">선택 안 함</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg transition-colors">
          {initial ? '저장' : '등록'}
        </button>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-slate-800 text-sm px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
