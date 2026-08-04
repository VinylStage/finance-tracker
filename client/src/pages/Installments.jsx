import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import DerivedTransactions from '../components/DerivedTransactions';
import DuplicateCandidates from '../components/DuplicateCandidates';
import InstallmentRegenerate from '../components/InstallmentRegenerate';
import InstallmentBillingHint from '../components/InstallmentBillingHint';
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
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('진행중');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);
  // 청구 내역을 만든 뒤 목록을 다시 부르기 위한 값. 할부 id 별로 센다.
  const [derivedReload, setDerivedReload] = useState({});
  const [derivedCount, setDerivedCount] = useState({});
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    const qs = filter === '전체' ? '' : `?status=${encodeURIComponent(filter)}`;
    const [inst, pms, cats] = await Promise.all([
      api.get(`/api/installments${qs}`),
      api.get('/api/payment-methods'),
      api.get('/api/categories'),
    ]);
    setItems(inst.data || []);
    setThisMonthTotal(inst.this_month_total || 0);
    setPaymentMethods(pms);
    setCategories(cats.data || cats || []);
  }, [filter]);

  // 거래내역에서 넘어왔으면 그 할부를 펼쳐 보여준다(#270).
  useHashTarget('installment', !loading, setOpenId);

  // 완료 처리에 확인을 받는다(#295).
  //
  // 바로 아래 handleDelete 는 확인을 거치는데 완료는 안 거쳤다. 되돌릴 수 없다는
  // 점에서는 둘이 같고, 기본 필터가 '진행중' 이라 목록에서 사라지는 것도 같다.
  // 실제로 잘못 눌러 DB 를 직접 고쳐 복구한 사고가 있었다.
  const handleComplete = async (it) => {
    const ok = await confirm(
      `「${it.merchant}」 할부를 완료로 표시할까요? 목록에서 사라지고, 청구 기간이 끝난 뒤에는 되돌릴 수 없어요.`,
      { confirmLabel: '완료 처리' }
    );
    if (!ok) return;
    try {
      await api.put(`/api/installments/${it.id}`, { status: '완료' });
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  // 완료를 되돌린다(#295). 되는지 여부는 서버가 판정해 내려준다 — 화면이 날짜
  // 계산을 다시 하면 스윕 조건과 어긋난다.
  const handleReopen = async (it) => {
    try {
      await api.post(`/api/installments/${it.id}/reopen`, {});
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
          categories={categories}
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
                          onClick={() => handleComplete(it)}
                          className="text-caption hover:text-brand-text transition-colors text-xs"
                        >
                          완료처리
                        </button>
                      )}
                      {it.status === '완료' && (
                        it.can_reopen ? (
                          <button
                            onClick={() => handleReopen(it)}
                            className="text-caption hover:text-brand-text transition-colors text-xs"
                          >
                            되돌리기
                          </button>
                        ) : (
                          // 비활성 버튼 대신 사유를 그대로 적는다. 눌리지 않는
                          // 버튼은 고장으로 읽히고 이유도 알려주지 않는다(#270 과 같은 기준).
                          <span
                            className="text-disabled text-xs"
                            title={it.reopen_blocked_reason || ''}
                          >
                            되돌릴 수 없음
                          </span>
                        )
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
                      <DerivedTransactions
                        kind="installment"
                        id={it.id}
                        reloadKey={derivedReload[it.id] || 0}
                        onLoaded={(n) => setDerivedCount((prev) => (prev[it.id] === n ? prev : { ...prev, [it.id]: n }))}
                      />
                      {/* 마이그레이션이 기존 할부에 청구 내역을 자동으로 만들지
                          않는다(ADR 0008). 사용자가 프리뷰를 보고 실행하는 자리다. */}
                      <InstallmentRegenerate
                        installment={it}
                        hasDerived={(derivedCount[it.id] || 0) > 0}
                        onDone={() => setDerivedReload((prev) => ({ ...prev, [it.id]: (prev[it.id] || 0) + 1 }))}
                      />
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

function InstallmentForm({ paymentMethods, categories, onSave, onCancel }) {
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
    category_id: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 자동계산이 채운 값인지, 사용자가 고친 값인지 구분한다(#316).
  // 한 번이라도 직접 고쳤으면 그 뒤로는 계산이 덮어쓰지 않는다 — 실제 청구서가
  // 계산과 다른 경우가 있고, 그때 사용자가 실제 값을 못 넣으면 가계부가 틀린
  // 값을 강제하게 된다.
  const [touched, setTouched] = useState({ monthly_amount: false, fee_per_month: false });
  const setTouchedField = (k, v) => {
    setTouched(t => (t[k] ? t : { ...t, [k]: true }));
    set(k, v);
  };

  const applyEstimate = (est) => {
    setForm(f => ({
      ...f,
      monthly_amount: touched.monthly_amount ? f.monthly_amount : String(est.monthly_amount),
      fee_per_month: touched.fee_per_month ? f.fee_per_month : String(est.fee_per_month),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      total_amount: Number(form.total_amount),
      months: Number(form.months),
      monthly_amount: Number(form.monthly_amount),
      fee_per_month: form.fee_per_month ? Number(form.fee_per_month) : 0,
      payment_method_id: form.payment_method_id ? Number(form.payment_method_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
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
          <input id="inst-monthly-amount" type="number" className={inp} value={form.monthly_amount} onChange={e => setTouchedField('monthly_amount', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="inst-fee-per-month" className="block text-xs text-caption mb-1">월 수수료 (원)</label>
          <input id="inst-fee-per-month" type="number" className={inp} placeholder="0" value={form.fee_per_month} onChange={e => setTouchedField('fee_per_month', e.target.value)} />
        </div>
        <div>
          <label htmlFor="inst-payment-method" className="block text-xs text-caption mb-1">카드</label>
          <select id="inst-payment-method" className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)}>
            <option value="">선택...</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          {/* 가맹점 카테고리. 정책을 고르는 기준이다(#316) — 같은 카드라도
              "온라인쇼핑 6개월 무이자" 처럼 카테고리별 예외가 있다(#315).
              고르지 않으면 그 카드의 기본 정책만 본다. 모르는 것을 아무
              카테고리로 채우면 엉뚱한 예외 정책이 걸린다. */}
          <label htmlFor="inst-category" className="block text-xs text-caption mb-1">가맹점 분류</label>
          <select id="inst-category" className={inp} value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">선택 안 함 (기본 정책)</option>
            {categories.filter(c => c.major_type !== '수입').map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="inst-start-billing-month" className="block text-xs text-caption mb-1">청구 시작월 *</label>
          <input id="inst-start-billing-month" type="month" className={inp} value={form.start_billing_month} onChange={e => set('start_billing_month', e.target.value)} required />
        </div>
      </div>

      <InstallmentBillingHint
        totalAmount={form.total_amount}
        months={form.months}
        paymentMethodId={form.payment_method_id}
        purchaseDate={form.purchase_date}
        startBillingMonth={form.start_billing_month}
        categoryId={form.category_id}
        monthlyAmount={form.monthly_amount}
        feePerMonth={form.fee_per_month}
        onEstimate={applyEstimate}
      />

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
