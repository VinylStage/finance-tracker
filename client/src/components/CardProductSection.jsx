import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import EmptyState from './EmptyState';
import { formatWon } from '../lib/format';

// 보유 카드 등록·관리(#302 1단계).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 화면이 필요한가
//
// #274 가 `card_products` 로 카드 상세를 담을 자리를 만들었고, #276 이 그 위에서
// 혜택 추정·사후 비교를 계산한다. 그런데 **사용자가 자기 카드를 등록할 동선이
// 어디에도 없었다.** 실사용 DB 의 등록 카드는 0장이다.
//
// 계산 엔진은 있는데 먹일 데이터가 없는 상태라, M8 전체가 여기서 막혀 있었다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 설정 화면 안인가 (이슈가 이 이슈에서 정하라고 남긴 결정)
//
// 카드 상품은 결제수단의 하위 개념이고, 카드 할부 정책(#271)도 이미 설정에 있다.
// 별도 최상위 화면을 만들면 NAV_GROUPS 를 건드려 #188 이 세운 5그룹 IA 를 흔든다.
// 설정에는 좌측 목차가 있어 항목이 늘어도 탐색된다.
//
// ─────────────────────────────────────────────────────────────────────────
// 카드사 하나에 카드 여러 장
//
// `payment_methods` 는 카드사 단위다(하나카드·삼성카드…). 그 아래 상품이 여러
// 장 붙을 수 있다 — #274 가 `payment_method_id` 에 UNIQUE 를 걸지 않은 이유다.
// 실제로 하나카드·신한카드가 2장 이상이다.
//
// 그래서 목록을 **카드사로 묶어** 보여준다. 평평하게 나열하면 어느 카드사 것인지
// 매번 읽어야 한다.
// ─────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  payment_method_id: '',
  issuer: '',
  product_name: '',
  card_type: '신용',
  annual_fee: '',
  prev_month_threshold: '',
  statement_close_day: '',
  billing_cycle_day: '',
};

function num(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

// 청구 주기가 다 채워졌을 때만 청구월 계산이 성립한다(#290). 반쪽이면
// 계산이 조용히 구매일의 달로 폴백하므로, 그 사실을 화면이 말해야 한다.
function cycleLabel(c) {
  if (c.statement_close_day && c.billing_cycle_day) {
    return `${c.statement_close_day}일 마감 · ${c.billing_cycle_day}일 결제`;
  }
  return '청구주기 미설정';
}

export default function CardProductSection({ paymentMethods }) {
  const cards = (paymentMethods || []).filter((p) => p.type === '신용' || p.type === '체크');

  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { confirm, alert } = useConfirm();

  const load = async () => {
    try {
      const res = await api.get('/api/card-products');
      setProducts(res.data || []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditingId(null);
    // 카드사가 하나뿐이면 골라 둔다. 매번 같은 값을 고르게 하지 않는다.
    setForm({ ...EMPTY_FORM, payment_method_id: cards.length === 1 ? String(cards[0].id) : '' });
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({
      payment_method_id: String(p.payment_method_id),
      issuer: p.issuer || '',
      product_name: p.product_name || '',
      card_type: p.card_type || '신용',
      annual_fee: p.annual_fee ?? '',
      prev_month_threshold: p.prev_month_threshold ?? '',
      statement_close_day: p.statement_close_day ?? '',
      billing_cycle_day: p.billing_cycle_day ?? '',
    });
    setSaveError(null);
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const body = {
      payment_method_id: Number(form.payment_method_id),
      issuer: form.issuer.trim(),
      product_name: form.product_name.trim(),
      card_type: form.card_type,
      annual_fee: num(form.annual_fee) ?? 0,
      prev_month_threshold: num(form.prev_month_threshold),
      statement_close_day: num(form.statement_close_day),
      billing_cycle_day: num(form.billing_cycle_day),
    };
    try {
      if (editingId) await api.put(`/api/card-products/${editingId}`, body);
      else await api.post('/api/card-products', body);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch (err) {
      // 같은 카드사에 같은 상품명이면 서버가 막는다. 문구를 그대로 보여준다.
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    // 혜택이 CASCADE 로 함께 지워진다. 되돌릴 수 없으니 확인을 받는다.
    const ok = await confirm(`'${p.product_name}' 을 지울까요? 등록한 혜택도 함께 지워져요.`);
    if (!ok) return;
    try {
      await api.del(`/api/card-products/${p.id}`);
      await load();
    } catch (err) {
      await alert(err.message);
    }
  };

  // 카드사로 묶는다.
  const grouped = cards
    .map((c) => ({ card: c, items: products.filter((p) => p.payment_method_id === c.id) }))
    .filter((g) => g.items.length > 0);
  const orphan = products.filter((p) => !cards.some((c) => c.id === p.payment_method_id));

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-caption">
          카드사가 아니라 <strong className="text-body">카드 한 장</strong> 단위로 등록해요.
          같은 카드사 카드가 여러 장이면 각각 등록할 수 있어요.
        </p>
        <button
          type="button" onClick={openNew}
          disabled={cards.length === 0}
          className="btn-primary text-xs px-3 py-1.5 rounded-control shrink-0 disabled:opacity-50"
        >
          + 카드 등록
        </button>
      </div>

      {loadError && (
        <p role="alert" className="text-xs text-loss-text">{loadError}</p>
      )}

      {cards.length === 0 && (
        <EmptyState
          title="먼저 결제수단을 등록해 주세요"
          description="'결제수단 관리' 에서 카드사를 추가하면 그 아래 카드를 등록할 수 있어요."
        />
      )}

      {cards.length > 0 && products.length === 0 && !showForm && (
        <EmptyState
          title="등록된 카드가 없어요"
          description="카드를 등록하면 어느 카드로 결제할지 고를 수 있고, 카드별 혜택 비교도 할 수 있어요."
        />
      )}

      {showForm && (
        <form onSubmit={submit} className="bg-surface-sunken rounded-card p-4 space-y-3">
          <h4 className="text-xs font-medium text-body">{editingId ? '카드 수정' : '카드 등록'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cp-method" className="block text-xs text-caption mb-1">카드사 *</label>
              <select id="cp-method" className={inp} value={form.payment_method_id} onChange={(e) => set('payment_method_id', e.target.value)} required>
                <option value="">선택...</option>
                {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cp-name" className="block text-xs text-caption mb-1">카드 이름 *</label>
              <input id="cp-name" type="text" className={inp} value={form.product_name}
                onChange={(e) => set('product_name', e.target.value)} placeholder="예: 삼성 iD ON" required />
            </div>
            <div>
              <label htmlFor="cp-issuer" className="block text-xs text-caption mb-1">발급사 *</label>
              <input id="cp-issuer" type="text" className={inp} value={form.issuer}
                onChange={(e) => set('issuer', e.target.value)} placeholder="예: 삼성카드" required />
            </div>
            <div>
              <label htmlFor="cp-type" className="block text-xs text-caption mb-1">종류</label>
              <select id="cp-type" className={inp} value={form.card_type} onChange={(e) => set('card_type', e.target.value)}>
                <option value="신용">신용</option>
                <option value="체크">체크</option>
              </select>
            </div>
            <div>
              <label htmlFor="cp-fee" className="block text-xs text-caption mb-1">연회비 (원)</label>
              <input id="cp-fee" type="number" min="0" className={inp} value={form.annual_fee}
                onChange={(e) => set('annual_fee', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label htmlFor="cp-threshold" className="block text-xs text-caption mb-1">전월 실적 기준 (원)</label>
              <input id="cp-threshold" type="number" min="0" className={inp} value={form.prev_month_threshold}
                onChange={(e) => set('prev_month_threshold', e.target.value)} placeholder="없으면 비워두세요" />
            </div>
            <div>
              <label htmlFor="cp-close" className="block text-xs text-caption mb-1">마감일</label>
              <input id="cp-close" type="number" min="1" max="31" className={inp} value={form.statement_close_day}
                onChange={(e) => set('statement_close_day', e.target.value)} placeholder="예: 25" />
            </div>
            <div>
              <label htmlFor="cp-pay" className="block text-xs text-caption mb-1">결제일</label>
              <input id="cp-pay" type="number" min="1" max="31" className={inp} value={form.billing_cycle_day}
                onChange={(e) => set('billing_cycle_day', e.target.value)} placeholder="예: 15" />
            </div>
          </div>

          {/* 마감일·결제일이 왜 필요한지 적는다. 안 적으면 사용자는 비워 둔다. */}
          <p className="text-[11px] text-caption">
            마감일과 결제일을 넣으면 할부 등록에서 첫 청구월을 자동으로 계산해요. 비워 두면 구매일의 달로 둡니다.
          </p>

          {saveError && <p role="alert" className="text-xs text-loss-text">{saveError}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-3 py-1.5 rounded-control disabled:opacity-60">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              className="text-xs text-caption hover:text-ink px-3 py-1.5 rounded-control hover:bg-surface-page">
              취소
            </button>
          </div>
        </form>
      )}

      {grouped.map(({ card, items }) => (
        <div key={card.id}>
          <h4 className="text-xs font-medium text-caption mb-1.5">{card.name}</h4>
          <ul className="space-y-1.5">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 bg-surface border border-line rounded-control px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">
                    {p.product_name}
                    <span className="ml-1.5 text-[11px] text-caption">{p.card_type}</span>
                  </p>
                  <p className="text-[11px] text-caption">
                    연회비 {formatWon(p.annual_fee)}
                    {p.prev_month_threshold ? ` · 전월실적 ${formatWon(p.prev_month_threshold)}` : ''}
                    {' · '}{cycleLabel(p)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => openEdit(p)} className="text-xs text-brand-text hover:underline">수정</button>
                  <button type="button" onClick={() => remove(p)} className="text-xs text-caption hover:text-loss-text">삭제</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {orphan.length > 0 && (
        // 결제수단이 지워졌거나 카드가 아닌 수단에 붙은 경우. 숨기면 사용자는
        // 목록 수가 안 맞는 이유를 알 수 없다.
        <div>
          <h4 className="text-xs font-medium text-loss-text mb-1.5">연결이 끊긴 카드</h4>
          <ul className="space-y-1.5">
            {orphan.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 bg-surface border border-line rounded-control px-3 py-2">
                <p className="text-sm text-ink truncate">{p.product_name}</p>
                <button type="button" onClick={() => remove(p)} className="text-xs text-caption hover:text-loss-text shrink-0">삭제</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
