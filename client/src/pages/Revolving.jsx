import React, { useEffect, useState, useCallback } from 'react';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Revolving() {
  const [items, setItems] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [cardFilter, setCardFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const qs = cardFilter ? `?payment_method_id=${cardFilter}` : '';
    Promise.all([
      fetch(`/api/revolving${qs}`).then(r => r.json()),
      fetch('/api/payment-methods').then(r => r.json()),
    ]).then(([rev, pms]) => {
      setItems(rev.data || []);
      setCurrentBalance(rev.current_carried_balance || 0);
      setPaymentMethods(pms);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [cardFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (formData) => {
    setError('');
    const r = await fetch('/api/revolving', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!r.ok) {
      const body = await r.json();
      setError(body.error || '저장 실패');
      return;
    }
    setShowForm(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/revolving/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">리볼빙 원장</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + 이번달 기록
        </button>
      </div>

      {showForm && (
        <RevolvingForm
          paymentMethods={paymentMethods}
          error={error}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setError(''); }}
        />
      )}

      <div className="flex items-center justify-between">
        <select
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
          value={cardFilter}
          onChange={e => setCardFilter(e.target.value)}
        >
          <option value="">전체 카드</option>
          {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="text-sm text-gray-400">
          현재 이월잔액: <span className="text-gray-100 font-semibold">{fmt(currentBalance)}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-10">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-gray-500 text-center py-10">리볼빙 기록이 없습니다.</div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-750">
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">월</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">카드</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">이월잔액</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">신규사용</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">납부액</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">이자</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">차월이월</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-800/50'}`}
                >
                  <td className="px-4 py-3 text-gray-100 whitespace-nowrap">{r.month}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{r.payment_method_name || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{fmt(r.carried_balance)}</td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{fmt(r.new_charge)}</td>
                  <td className="px-4 py-3 text-right text-gray-100 tabular-nums">{fmt(r.paid_amount)}</td>
                  <td className="px-4 py-3 text-right text-rose-400 tabular-nums">{fmt(r.interest)}</td>
                  <td className="px-4 py-3 text-right text-indigo-300 font-medium tabular-nums">{fmt(r.next_carried_balance)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-gray-500 hover:text-rose-400 transition-colors text-xs"
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

function RevolvingForm({ paymentMethods, error, onSave, onCancel }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [form, setForm] = useState({
    month: thisMonth,
    payment_method_id: '',
    carried_balance: '',
    new_charge: '',
    paid_amount: '',
    interest: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      payment_method_id: Number(form.payment_method_id),
      carried_balance: Number(form.carried_balance) || 0,
      new_charge: Number(form.new_charge) || 0,
      paid_amount: Number(form.paid_amount) || 0,
      interest: Number(form.interest) || 0,
    });
  };

  const inp = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500';

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-300">리볼빙 월 기록</h2>
      {error && <p className="text-rose-400 text-xs">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">월 *</label>
          <input type="month" className={inp} value={form.month} onChange={e => set('month', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">카드 *</label>
          <select className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)} required>
            <option value="">선택...</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">이월잔액 (원)</label>
          <input type="number" className={inp} placeholder="0" value={form.carried_balance} onChange={e => set('carried_balance', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">신규사용액 (원)</label>
          <input type="number" className={inp} placeholder="0" value={form.new_charge} onChange={e => set('new_charge', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">납부액 (원) *</label>
          <input type="number" className={inp} placeholder="0" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">이자 (원)</label>
          <input type="number" className={inp} placeholder="0" value={form.interest} onChange={e => set('interest', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg transition-colors">
          저장
        </button>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-200 text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
