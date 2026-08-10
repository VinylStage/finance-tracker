import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import EmptyState from './EmptyState';
import { formatWon } from '../lib/format';
import { useConfirm } from './ConfirmProvider';

// 서버 `src/constants.js` 의 BENEFIT_TYPES 와 같아야 한다. 어긋나면 저장할 때만 400 이 난다.
const BENEFIT_TYPES = ['할인', '적립'];

// 이 혜택이 무엇에 걸리는지. 카테고리와 가맹점 둘 다 선택이라 넷으로 갈린다.
function targetLabel(b) {
  if (b.category_name && b.merchant_pattern) return `${b.category_name} · 가맹점 '${b.merchant_pattern}'`;
  if (b.category_name) return b.category_name;
  if (b.merchant_pattern) return `가맹점 '${b.merchant_pattern}'`;
  return '모든 결제';
}

// 조건을 사람이 읽는 말로. 없는 조건은 아예 말하지 않는다 — "한도 없음" 을
// 적으면 한도가 설정된 것처럼 읽힌다.
function conditionLabel(b) {
  const parts = [];
  if (b.min_amount > 0) parts.push(`${formatWon(b.min_amount)} 이상 결제`);
  if (b.monthly_cap !== null && b.monthly_cap !== undefined) parts.push(`월 ${formatWon(b.monthly_cap)}까지`);
  return parts.join(' · ');
}

const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

const EMPTY_FORM = {
  benefit_type: '할인', rate: '', category_id: '', merchant_pattern: '',
  monthly_cap: '', min_amount: '', memo: '',
};

export default function CardBenefitSection({ categories = [] }) {
  const [cards, setCards] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [benefits, setBenefits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 첫 로딩이 끝나기 전에는 빈 상태를 내지 않는다. `cards` 가 처음에 [] 라서
  // 그냥 두면 "먼저 카드를 등록해 주세요" 가 번쩍 떴다가 목록으로 바뀐다 —
  // 사용자가 등록이 안 된 줄 알고 되돌아간다.
  const [loaded, setLoaded] = useState(false);

  const { confirm, alert } = useConfirm();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // 빈 칸과 0 은 다르다.
  //
  //   rate 0      "이 대상에는 혜택 없음" 을 명시한 값이다. 안 적은 것과 다르다
  //   min_amount  빈 칸이면 서버가 0(조건 없음)으로 넣는다
  //   monthly_cap 빈 칸이면 한도 없음이다. 0 을 보내면 "한도 0원" 이 된다
  //
  // 그래서 빈 칸은 보내지 않고, 0 은 그대로 보낸다.
  const buildBody = () => {
    const body = {
      card_product_id: Number(selectedCardId),
      benefit_type: form.benefit_type,
      rate: Number(form.rate),
    };
    for (const k of ['category_id', 'merchant_pattern', 'monthly_cap', 'min_amount', 'memo']) {
      if (form[k] === '') continue;
      body[k] = k === 'merchant_pattern' || k === 'memo' ? form[k] : Number(form[k]);
    }
    return body;
  };

  // 카드 목록을 불러오는 함수
  const loadCards = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/card-products?include_inactive=1');
      // `|| []` 를 뺄 수 없다. 응답에 `data` 가 없으면 `undefined` 가 들어가고
      // 바로 아래 `cards.length` 에서 화면 전체가 죽는다 — 이 섹션 하나가 설정
      // 화면을 통째로 못 뜨게 만든다.
      setCards(response.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // 선택된 카드의 혜택을 불러오는 함수
  const loadBenefits = useCallback(async (cardId) => {
    if (!cardId) {
      setBenefits([]);
      return;
    }

    try {
      setLoading(true);
      const response = await api.get(`/api/card-benefits?card_product_id=${cardId}`);
      setBenefits(response.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 카드 선택 시 혜택 목록을 불러옴
  useEffect(() => {
    if (selectedCardId) {
      loadBenefits(selectedCardId);
    } else {
      setBenefits([]);
    }
  }, [selectedCardId, loadBenefits]);

  // 컴포넌트 마운트 시 카드 목록을 불러옴
  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // 카드 선택 변경 핸들러
  const handleCardChange = (e) => {
    setSelectedCardId(e.target.value);
  };

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (b) => {
    setForm({
      benefit_type: b.benefit_type,
      rate: String(b.rate ?? ''),
      category_id: String(b.category_id ?? ''),
      merchant_pattern: b.merchant_pattern || '',
      monthly_cap: String(b.monthly_cap ?? ''),
      min_amount: String(b.min_amount ?? ''),
      memo: b.memo || '',
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const save = async () => {
    if (form.rate === '') {
      await alert('혜택 비율을 입력해 주세요. 0도 넣을 수 있어요.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/card-benefits/${editingId}`, buildBody());
      } else {
        await api.post('/api/card-benefits', buildBody());
      }
      setShowForm(false);
      await loadBenefits(selectedCardId);
    } catch (err) {
      await alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const remove = async (b) => {
    if (!await confirm(`${b.rate}% ${b.benefit_type} 혜택을 지울까요?`)) return;
    // 삭제 실패를 삼키면 화면에서만 사라진 것처럼 보인다. 목록을 다시 실으면
    // 되돌아오는데, 사용자는 왜 되살아났는지 모른다.
    try {
      await api.del(`/api/card-benefits/${b.id}`);
      await loadBenefits(selectedCardId);
    } catch (err) {
      await alert(err.message);
    }
  };

  if (!loaded) return null;

  // 카드가 없으면 EmptyState만 렌더
  if (cards.length === 0) {
    return (
      <EmptyState
        title="먼저 카드를 등록해 주세요"
        description="'보유 카드' 에서 카드를 등록하면, 그 카드의 할인·적립 조건을 여기에 넣을 수 있어요."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-caption">
        카드사가 주는 할인·적립 조건을 넣어 두면, 결제할 때 어느 카드가 나은지 계산할 수 있어요.
      </p>

      <label htmlFor="benefit-card" className="block text-sm font-medium text-ink">
        어느 카드의 혜택인가요
      </label>
      <select
        id="benefit-card"
        value={selectedCardId}
        onChange={handleCardChange}
        className={inp}
      >
        <option value="">카드를 골라 주세요</option>
        {cards.map(card => {
          const label = `${card.product_name} · ${card.payment_method_name || card.issuer}`;
          const suffix = card.is_active ? '' : ' (더 안 씀)';
          return (
            <option key={card.id} value={card.id}>
              {label}{suffix}
            </option>
          );
        })}
      </select>

      {selectedCardId && (
        <button
          type="button"
          onClick={startAdd}
          className="btn-primary text-xs px-3 py-1.5 rounded-control"
        >
          혜택 추가
        </button>
      )}

      {showForm && (
        <div className="bg-surface-sunken rounded-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-type">혜택 종류</label>
              <select
                id="benefit-type"
                value={form.benefit_type}
                onChange={(e) => setField('benefit_type', e.target.value)}
                className={inp}
              >
                {BENEFIT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-rate">비율 (%)</label>
              <input
                type="number"
                id="benefit-rate"
                value={form.rate}
                onChange={(e) => setField('rate', e.target.value)}
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-category">어느 카테고리에 (선택)</label>
              <select
                id="benefit-category"
                value={form.category_id}
                onChange={(e) => setField('category_id', e.target.value)}
                className={inp}
              >
                <option value="">모든 카테고리</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-merchant">가맹점 이름에 이 말이 들어가면 (선택)</label>
              <input
                type="text"
                id="benefit-merchant"
                value={form.merchant_pattern}
                onChange={(e) => setField('merchant_pattern', e.target.value)}
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-cap">월 한도 (선택)</label>
              <input
                type="number"
                id="benefit-cap"
                value={form.monthly_cap}
                onChange={(e) => setField('monthly_cap', e.target.value)}
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-min">건당 최소 결제액 (선택)</label>
              <input
                type="number"
                id="benefit-min"
                value={form.min_amount}
                onChange={(e) => setField('min_amount', e.target.value)}
                className={inp}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-memo">메모 (선택)</label>
              <input
                type="text"
                id="benefit-memo"
                value={form.memo}
                onChange={(e) => setField('memo', e.target.value)}
                className={inp}
              />
            </div>

            <div className="sm:col-span-2 text-xs text-caption">
              둘 다 비우면 이 카드의 모든 결제에 걸려요. 둘 다 넣으면 두 조건을 함께 만족할 때만 걸려요.
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary text-xs px-3 py-1.5 rounded-control"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-xs px-3 py-1.5 rounded-control text-caption"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {selectedCardId && benefits.length === 0 && (
        <p className="text-xs text-caption">
          아직 이 카드의 혜택을 안 넣었어요. 넣기 전에는 카드 추천이 모든 카드를 똑같이 봅니다.
        </p>
      )}

      {benefits.length > 0 && (
        <ul className="space-y-2">
          {benefits.map(b => (
            <li key={b.id} className="text-xs text-body flex flex-wrap items-baseline gap-x-2">
              <strong className="text-body">{b.rate}% {b.benefit_type}</strong>
              <span className="text-caption">{targetLabel(b)}</span>
              {conditionLabel(b) && (
                <span className="text-caption">{conditionLabel(b)}</span>
              )}
              {b.memo && (
                <span className="text-caption">{b.memo}</span>
              )}
              <button type="button" onClick={() => startEdit(b)} className="text-xs text-caption underline">수정</button>
              <button type="button" onClick={() => remove(b)} className="text-xs text-loss-text underline">삭제</button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs text-loss-text">
          {error}
        </p>
      )}
    </div>
  );
}
