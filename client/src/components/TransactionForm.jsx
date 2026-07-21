import React, { useState, useEffect } from 'react';

const PAYMENT_STYLES = ['일시불', '할부', '리볼빙', '해당없음'];

export default function TransactionForm({ initial, categories, paymentMethods, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    category_id: '',
    amount: '',
    payment_method_id: '',
    payment_style: '일시불',
    merchant: '',
    memo: '',
    ...( initial ? {
      date: initial.date,
      category_id: String(initial.category_id),
      amount: String(initial.amount),
      payment_method_id: String(initial.payment_method_id || ''),
      payment_style: initial.payment_style,
      merchant: initial.merchant || '',
      memo: initial.memo || '',
    } : {}),
  });

  const majorTypes = [...new Set(categories.map(c => c.major_type))];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleMerchantBlur = async () => {
    if (!form.merchant || form.category_id) return;
    const r = await fetch(`/api/transactions/suggest/category?merchant=${encodeURIComponent(form.merchant)}`);
    const { category_id } = await r.json();
    if (category_id) set('category_id', String(category_id));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      amount: Number(form.amount),
      category_id: Number(form.category_id),
      payment_method_id: form.payment_method_id ? Number(form.payment_method_id) : null,
    });
  };

  const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">
        {initial ? '거래 수정' : '새 거래 추가'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">날짜 *</label>
          <input type="date" className={inp} value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">금액 (원) *</label>
          <input
            type="number" className={inp} placeholder="0"
            value={form.amount} onChange={e => set('amount', e.target.value)} required
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">카테고리 *</label>
          <select className={inp} value={form.category_id} onChange={e => set('category_id', e.target.value)} required>
            <option value="">선택...</option>
            {majorTypes.map(mt => (
              <optgroup key={mt} label={mt}>
                {categories.filter(c => c.major_type === mt).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">결제수단</label>
          <select className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)}>
            <option value="">선택...</option>
            {paymentMethods.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">결제방식</label>
          <select className={inp} value={form.payment_style} onChange={e => set('payment_style', e.target.value)}>
            {PAYMENT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">가맹점/내용</label>
          <input
            type="text" className={inp} placeholder="가맹점명 (자동 카테고리 제안)"
            value={form.merchant}
            onChange={e => set('merchant', e.target.value)}
            onBlur={handleMerchantBlur}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">메모</label>
        <input type="text" className={inp} placeholder="메모 (선택)"
          value={form.memo} onChange={e => set('memo', e.target.value)} />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg transition-colors">
          {initial ? '저장' : '추가'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-slate-500 hover:text-slate-800 text-sm px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
