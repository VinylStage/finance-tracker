import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import DerivedTransactions from '../components/DerivedTransactions';
import DuplicateCandidates from '../components/DuplicateCandidates';
import { useHashTarget } from '../hooks/useHashTarget';
import { anchorId } from '../lib/derivedOrigin';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

const STATUS_FILTERS = ['진행중', '완료', '전체'];

export default function Installments() {
  const [items, setItems] = useState([]);
  const [thisMonthTotal, setThisMonthTotal] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [filter, setFilter] = useState('진행중');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    const qs = filter === '전체' ? '' : `?status=${encodeURIComponent(filter)}`;
    const [inst, pms] = await Promise.all([
      api.get(`/api/installments${qs}`),
      api.get('/api/payment-methods'),
    ]);
    setItems(inst.data || []);
    setThisMonthTotal(inst.this_month_total || 0);
    setPaymentMethods(pms);
  }, [filter]);

  // 거래내역에서 넘어왔으면 그 할부를 펼쳐 보여준다(#270).
  useHashTarget('installment', !loading, setOpenId);

  const handleComplete = async (id) => {
    try {
      await api.put(`/api/installments/${id}`, { status: '완료' });
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!await confirm('삭제하시겠습니까?', { tone: 'danger' })) return;
    try {
      await api.del(`/api/installments/${id}`);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleSave = async (formData) => {
    try {
      await api.post('/api/installments', formData);
      setShowForm(false);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">할부 관리</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="btn-primary text-sm px-4 py-2 rounded-control transition-colors"
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

      {/* 중복 의심 거래는 목록 위에 둔다. 할부를 새로 등록한 직후가 가장 흔한
          발견 시점이고, 아래로 내리면 스크롤해야 만난다(#269). */}
      <DuplicateCandidates />

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-control transition-colors ${
                filter === s ? 'bg-brand-tint text-brand-text font-medium' : 'text-caption hover:text-ink hover:bg-surface-sunken'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-sm text-caption">
          이번달 청구 합계: <span className="text-ink font-semibold">{fmt(thisMonthTotal)}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <div className="text-caption text-center py-10">할부 내역이 없습니다.</div>
      ) : (
        <div className="bg-surface shadow-card rounded-card border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-page">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 text-caption font-medium">가맹점</th>
                <th className="text-right px-4 py-3 text-caption font-medium">총액</th>
                <th className="text-right px-4 py-3 text-caption font-medium">월납부</th>
                <th className="text-center px-4 py-3 text-caption font-medium">진행</th>
                <th className="text-center px-4 py-3 text-caption font-medium">잔여</th>
                <th className="text-left px-4 py-3 text-caption font-medium hidden sm:table-cell">결제수단</th>
                <th className="text-center px-4 py-3 text-caption font-medium">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <React.Fragment key={it.id}>
                <tr
                  id={anchorId('installment', it.id)}
                  className={`border-b border-line-faint hover:bg-surface-page transition-colors scroll-mt-6 ${i % 2 === 0 ? '' : 'bg-surface-page/50'} ${openId === it.id ? 'bg-brand-tint/40' : ''}`}
                >
                  <td className="px-4 py-3 text-ink">{it.merchant}</td>
                  <td className="px-4 py-3 text-right text-body tabular-nums">{fmt(it.total_amount)}</td>
                  <td className="px-4 py-3 text-right text-ink tabular-nums">{fmt(it.monthly_amount)}</td>
                  <td className="px-4 py-3 text-center text-caption">{it.billed_months}/{it.months}</td>
                  <td className="px-4 py-3 text-center text-caption">
                    {it.remaining_months > 0 ? `${it.remaining_months}개월` : '-'}
                  </td>
                  <td className="px-4 py-3 text-caption text-xs hidden sm:table-cell">{it.payment_method_name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${it.status === '진행중' ? 'text-brand-text' : 'text-caption'}`}>
                      {it.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setOpenId(openId === it.id ? null : it.id)}
                        aria-expanded={openId === it.id}
                        className="text-caption hover:text-brand-text transition-colors text-xs"
                      >
                        청구 내역 {openId === it.id ? '▲' : '▼'}
                      </button>
                      {it.status === '진행중' && (
                        <button
                          onClick={() => handleComplete(it.id)}
                          className="text-caption hover:text-brand-text transition-colors text-xs"
                        >
                          완료처리
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(it.id)}
                        className="text-caption hover:text-loss-text transition-colors text-xs"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
                {openId === it.id && (
                  <tr className="border-b border-line-faint bg-surface-page/30">
                    <td colSpan={8} className="px-4">
                      <DerivedTransactions kind="installment" id={it.id} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InstallmentForm({ paymentMethods, onSave, onCancel }) {
  const today = localYMD();
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

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">할부 등록</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="inst-purchase-date" className="block text-xs text-caption mb-1">구매일 *</label>
          <input id="inst-purchase-date" type="date" className={inp} value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="inst-merchant" className="block text-xs text-caption mb-1">가맹점 *</label>
          <input id="inst-merchant" type="text" className={inp} value={form.merchant} onChange={e => set('merchant', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="inst-total-amount" className="block text-xs text-caption mb-1">총액 (원) *</label>
          <input id="inst-total-amount" type="number" className={inp} value={form.total_amount} onChange={e => set('total_amount', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="inst-months" className="block text-xs text-caption mb-1">개월수 *</label>
          <input id="inst-months" type="number" min="2" className={inp} value={form.months} onChange={e => set('months', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="inst-monthly-amount" className="block text-xs text-caption mb-1">월납부액 (원) *</label>
          <input id="inst-monthly-amount" type="number" className={inp} value={form.monthly_amount} onChange={e => set('monthly_amount', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="inst-fee-per-month" className="block text-xs text-caption mb-1">월 수수료 (원)</label>
          <input id="inst-fee-per-month" type="number" className={inp} placeholder="0" value={form.fee_per_month} onChange={e => set('fee_per_month', e.target.value)} />
        </div>
        <div>
          <label htmlFor="inst-payment-method" className="block text-xs text-caption mb-1">카드</label>
          <select id="inst-payment-method" className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)}>
            <option value="">선택...</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="inst-start-billing-month" className="block text-xs text-caption mb-1">청구 시작월 *</label>
          <input id="inst-start-billing-month" type="month" className={inp} value={form.start_billing_month} onChange={e => set('start_billing_month', e.target.value)} required />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">
          등록
        </button>
        <button type="button" onClick={onCancel} className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
