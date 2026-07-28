import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYearMonth } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Revolving() {
  const [items, setItems] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [cardFilter, setCardFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const { confirm, alert } = useConfirm();

  const { loading, error: loadError, reload } = useLoader(async () => {
    const qs = cardFilter ? `?payment_method_id=${cardFilter}` : '';
    const [rev, pms] = await Promise.all([
      api.get(`/api/revolving${qs}`),
      api.get('/api/payment-methods'),
    ]);
    setItems(rev.data || []);
    setCurrentBalance(rev.current_carried_balance || 0);
    setPaymentMethods(pms);
  }, [cardFilter]);

  const handleSave = async (formData) => {
    setError('');
    try {
      await api.post('/api/revolving', formData);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.message || '저장 실패');
    }
  };

  const handleDelete = async (id) => {
    if (!await confirm('삭제하시겠습니까?', { tone: 'danger' })) return;
    try {
      await api.del(`/api/revolving/${id}`);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">리볼빙 원장</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="btn-primary text-sm px-4 py-2 rounded-control transition-colors"
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
          aria-label="카드 필터"
          className="bg-surface border border-line rounded-control px-3 py-1.5 text-sm text-ink"
          value={cardFilter}
          onChange={e => setCardFilter(e.target.value)}
        >
          <option value="">전체 카드</option>
          {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="text-sm text-caption">
          현재 이월잔액: <span className="text-ink font-semibold">{fmt(currentBalance)}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : loadError ? (
        <LoadError error={loadError} onRetry={reload} />
      ) : items.length === 0 ? (
        <div className="text-caption text-center py-10">리볼빙 기록이 없습니다.</div>
      ) : (
        <div className="bg-surface shadow-card rounded-card border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-page">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 text-caption font-medium">월</th>
                <th className="text-left px-4 py-3 text-caption font-medium hidden sm:table-cell">카드</th>
                <th className="text-right px-4 py-3 text-caption font-medium">이월잔액</th>
                <th className="text-right px-4 py-3 text-caption font-medium">신규사용</th>
                <th className="text-right px-4 py-3 text-caption font-medium">납부액</th>
                <th className="text-right px-4 py-3 text-caption font-medium">이자</th>
                <th className="text-right px-4 py-3 text-caption font-medium">차월이월</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-line-faint hover:bg-surface-page transition-colors ${i % 2 === 0 ? '' : 'bg-surface-page/50'}`}
                >
                  <td className="px-4 py-3 text-ink whitespace-nowrap">{r.month}</td>
                  <td className="px-4 py-3 text-caption text-xs hidden sm:table-cell">{r.payment_method_name || '—'}</td>
                  <td className="px-4 py-3 text-right text-body tabular-nums">{fmt(r.carried_balance)}</td>
                  <td className="px-4 py-3 text-right text-body tabular-nums">{fmt(r.new_charge)}</td>
                  <td className="px-4 py-3 text-right text-ink tabular-nums">{fmt(r.paid_amount)}</td>
                  <td className="px-4 py-3 text-right text-loss-text tabular-nums">{fmt(r.interest)}</td>
                  <td className="px-4 py-3 text-right text-brand-text font-medium tabular-nums">{fmt(r.next_carried_balance)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-caption hover:text-loss-text transition-colors text-xs"
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
  const thisMonth = localYearMonth();
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

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">리볼빙 월 기록</h2>
      {error && <p className="text-loss-text text-xs">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="rev-month" className="block text-xs text-caption mb-1">월 *</label>
          <input id="rev-month" type="month" className={inp} value={form.month} onChange={e => set('month', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="rev-payment-method" className="block text-xs text-caption mb-1">카드 *</label>
          <select id="rev-payment-method" className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)} required>
            <option value="">선택...</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rev-carried-balance" className="block text-xs text-caption mb-1">이월잔액 (원)</label>
          <input id="rev-carried-balance" type="number" className={inp} placeholder="0" value={form.carried_balance} onChange={e => set('carried_balance', e.target.value)} />
        </div>
        <div>
          <label htmlFor="rev-new-charge" className="block text-xs text-caption mb-1">신규사용액 (원)</label>
          <input id="rev-new-charge" type="number" className={inp} placeholder="0" value={form.new_charge} onChange={e => set('new_charge', e.target.value)} />
        </div>
        <div>
          <label htmlFor="rev-paid-amount" className="block text-xs text-caption mb-1">납부액 (원) *</label>
          <input id="rev-paid-amount" type="number" className={inp} placeholder="0" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="rev-interest" className="block text-xs text-caption mb-1">이자 (원)</label>
          <input id="rev-interest" type="number" className={inp} placeholder="0" value={form.interest} onChange={e => set('interest', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">
          저장
        </button>
        <button type="button" onClick={onCancel} className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
