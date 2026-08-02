import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { localYMD, localYearMonth } from '../lib/date';
import { remainingBudget, toSpentMap } from '../lib/quickEntry';

// 정본은 src/constants.js(백엔드, CommonJS)의 PAYMENT_STYLES.
// 프런트(ESM/Vite)와 빌드 도구가 분리되어 있어 값을 공유하지 못하므로 수동 동기화 필요(#90).
const PAYMENT_STYLES = ['일시불', '할부', '리볼빙', '해당없음'];

const CONFIDENCE_STYLE = {
  '완전일치': 'bg-goal-tint text-goal-text',
  '부분일치': 'bg-pending-tint text-pending-text',
  '없음': 'bg-surface-sunken text-caption',
};

export default function TransactionForm({ initial, categories, paymentMethods, onSave, onCancel }) {
  const today = localYMD();
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
  const [suggesting, setSuggesting] = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [recentMerchants, setRecentMerchants] = useState([]);
  const [spentMap, setSpentMap] = useState({});

  useEffect(() => {
    api.get('/api/transactions/suggest/merchants?limit=10')
      .then(d => setRecentMerchants(d.data || []))
      .catch(() => {}); // 최근 가맹점 제안은 보조 기능이라 실패해도 무시
  }, []);

  // 잔여예산 표시용. 이번달 1일부터 오늘까지의 카테고리별 지출을 한 번만 받아둔다.
  useEffect(() => {
    const ym = localYearMonth();
    api.get(`/api/transactions/summary/category-breakdown?from=${ym}-01&to=${localYMD()}`)
      .then(d => setSpentMap(toSpentMap(d.data)))
      .catch(() => {}); // 잔여예산도 보조 정보라 실패해도 입력을 막지 않는다
  }, []);

  const majorTypes = [...new Set(categories.map(c => c.major_type))];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleMerchantChange = (v) => {
    set('merchant', v);
    setConfidence(null);
  };

  // 최근 가맹점 칩 원탭. 반복 입력에서 타이핑을 없애는 게 목적이므로
  // 가맹점명만 넣고 끝내지 않고 카테고리 자동제안까지 이어서 태운다.
  const handleMerchantChip = async (name) => {
    set('merchant', name);
    setConfidence(null);
    if (form.category_id) return;
    setSuggesting(true);
    try {
      const { category_id, confidence: conf } = await api.get(
        `/api/transactions/suggest/category?merchant=${encodeURIComponent(name)}`
      );
      setConfidence(conf);
      if (category_id) set('category_id', String(category_id));
    } catch {
      // 자동 제안 실패는 입력 흐름을 막지 않는다
    } finally {
      setSuggesting(false);
    }
  };

  const handleMerchantBlur = async () => {
    if (!form.merchant || form.category_id) return;
    setSuggesting(true);
    try {
      const { category_id, confidence: conf } = await api.get(
        `/api/transactions/suggest/category?merchant=${encodeURIComponent(form.merchant)}`
      );
      setConfidence(conf);
      if (category_id) set('category_id', String(category_id));
    } catch {
      // 카테고리 자동 제안 실패는 입력 흐름을 막지 않도록 조용히 무시한다
    } finally {
      setSuggesting(false);
    }
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

  const selectedCategory = categories.find(c => String(c.id) === String(form.category_id));
  const budgetHint = remainingBudget(selectedCategory, spentMap);
  const fmtWon = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="tx-date" className="block text-xs text-caption mb-1">날짜 *</label>
          <input id="tx-date" type="date" className={inp} value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>

        <div>
          <label htmlFor="tx-amount" className="block text-xs text-caption mb-1">금액 (원) *</label>
          <input
            id="tx-amount" type="number" className={inp} placeholder="0"
            value={form.amount} onChange={e => set('amount', e.target.value)} required
          />
        </div>

        <div>
          <label htmlFor="tx-category" className="flex items-center gap-1.5 text-xs text-caption mb-1">
            카테고리 *
            {confidence && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CONFIDENCE_STYLE[confidence]}`}>
                {confidence}
              </span>
            )}
          </label>
          <select id="tx-category" className={inp} value={form.category_id} onChange={e => set('category_id', e.target.value)} required>
            <option value="">선택...</option>
            {/* optgroup label 은 문자열만 받는다. 아이콘이 이모지에서 SVG 키로
                바뀐 뒤 이 자리에 키가 그대로 노출됐다(`payments 수입`). 아이콘은
                대분류를 나타내는 보조 채널이고 이름이 이미 함께 나오므로 뺀다. */}
            {majorTypes.map(mt => (
              <optgroup key={mt} label={mt}>
                {categories.filter(c => c.major_type === mt).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {budgetHint.show && (
            <p className="mt-1.5 text-[11px] tabular-nums">
              {budgetHint.level === 'over' ? (
                <span className="text-loss-text">이번달 예산 {fmtWon(budgetHint.over)} 초과</span>
              ) : budgetHint.level === 'caution' ? (
                <span className="text-warn-text">이번달 {fmtWon(budgetHint.remaining)} 남음 · 주의</span>
              ) : (
                <span className="text-caption">이번달 {fmtWon(budgetHint.remaining)} 남음</span>
              )}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="tx-payment-method" className="block text-xs text-caption mb-1">결제수단</label>
          <select id="tx-payment-method" className={inp} value={form.payment_method_id} onChange={e => set('payment_method_id', e.target.value)}>
            <option value="">선택...</option>
            {paymentMethods.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tx-payment-style" className="block text-xs text-caption mb-1">결제방식</label>
          <select id="tx-payment-style" className={inp} value={form.payment_style} onChange={e => set('payment_style', e.target.value)}>
            {PAYMENT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="tx-merchant" className="flex items-center gap-1.5 text-xs text-caption mb-1">
            가맹점/내용
            {suggesting && <span className="text-brand-text text-[10px]">제안 중...</span>}
          </label>
          <input
            id="tx-merchant" type="text" className={inp} placeholder="가맹점명 (자동 카테고리 제안)"
            list="recent-merchants"
            value={form.merchant}
            onChange={e => handleMerchantChange(e.target.value)}
            onBlur={handleMerchantBlur}
          />
          <datalist id="recent-merchants">
            {recentMerchants.map(m => <option key={m} value={m} />)}
          </datalist>
          {recentMerchants.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {recentMerchants.slice(0, 5).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleMerchantChip(name)}
                  disabled={suggesting}
                  className="rounded-full border border-line bg-surface-page px-2 py-0.5 text-[11px] text-body hover:border-brand-fill hover:text-brand-text disabled:opacity-50"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="tx-memo" className="block text-xs text-caption mb-1">메모</label>
        <input id="tx-memo" type="text" className={inp} placeholder="메모 (선택)"
          value={form.memo} onChange={e => set('memo', e.target.value)} />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit"
          className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">
          {initial ? '저장' : '추가'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
