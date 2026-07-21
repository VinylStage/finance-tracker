import React, { useEffect, useState, useCallback } from 'react';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

const STATUS_FILTERS = ['진행중', '완료', '전체'];

export default function Installments() {
  const [items, setItems] = useState([]);
  const [thisMonthTotal, setThisMonthTotal] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [filter, setFilter] = useState('진행중');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = filter === '전체' ? '' : `?status=${encodeURIComponent(filter)}`;
    Promise.all([
      fetch(`/api/installments${qs}`).then(r => r.json()),
      fetch('/api/payment-methods').then(r => r.json()),
    ]).then(([inst, pms]) => {
      setItems(inst.data || []);
      setThisMonthTotal(inst.this_month_total || 0);
      setPaymentMethods(pms);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (id) => {
    await fetch(`/api/installments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '완료' }),
    });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/installments/${id}`, { method: 'DELETE' });
    load();
  };

  const handleSave = async (formData) => {
    await fetch('/api/installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setShowForm(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">할부 관리</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + 할부 등록
        </button>
      </div>

      {showForm && (
        <InstallmentForm
          paymentMethods={paymentMethods}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                filter === s ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          이번달 청구 합계: <span className="text-slate-800 font-semibold">{fmt(thisMonthTotal)}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-slate-500 text-center py-10">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-slate-400 text-center py-10">할부 내역이 없습니다.</div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-500 font-medium">가맹점</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">총액</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">월납부</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">진행</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">잔여</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium hidden sm:table-cell">결제수단</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={it.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                >
                  <td className="px-4 py-3 text-slate-800">{it.merchant}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmt(it.total_amount)}</td>
                  <td className="px-4 py-3 text-right text-slate-800 tabular-nums">{fmt(it.monthly_amount)}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{it.billed_months}/{it.months}</td>
                  <td className="px-4 py-3 text-center text-slate-500">
                    {it.remaining_months > 0 ? `${it.remaining_months}개월` : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{it.payment_method_name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${it.status === '진행중' ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {it.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {it.status === '진행중' && (
                        <button
                          onClick={() => handleComplete(it.id)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors text-xs"
                        >
                          완료처리
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(it.id)}
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

function InstallmentForm({ paymentMethods, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const [form, setForm] = useState({
    purchase_date: today,
    merchant: '',
    total_amount: '',
    months: '',
    monthly_amount: '',
    fee_per_month: '',
    payment_method_id: '',
    start_billing_month: thisMonth,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      total_amount: Number(form.total_amount),
      months: Number(form.months),
      monthly_amount: Number(form.monthly_amount),
      fee_per_month: form.fee_per_month ? Number(form.fee_per_month) : 0,
      payment_method_id: form.payment_method_id ? Number(form.payment_method_id) : null,
    });
  };

  const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-600">할부 등록</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">구매일 *</label>
          <input type="date" className={inp} value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">가맹점 *</label>
          <input type="text" className={inp} value={form.merchant} onChange={e => set('merchant', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">총액 (원) *</label>
          <input type="number" className={inp} value={form.total_amount} onChange={e => set('total_amount', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">개월수 *</label>
          <input type="number" min="2" className={inp} value={form.months} onChange={e => set('months', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">월납부액 (원) *</label>
          <input type="number" className={inp} value={form.monthly_amount} onChange={e => set('monthly_amount', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">월 수수료 (원)</label>
          <input type="number" className={inp} placeholder="0" value={form.fee_per_month} onChange={e => set('fee_per_month', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">카드</label>
          <select className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)}>
            <option value="">선택...</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">청구 시작월 *</label>
          <input type="month" className={inp} value={form.start_billing_month} onChange={e => set('start_billing_month', e.target.value)} required />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg transition-colors">
          등록
        </button>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-slate-800 text-sm px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
