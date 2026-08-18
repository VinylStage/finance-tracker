import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import EmptyState from './EmptyState';
import { formatWon } from '../lib/format';
import { conditionText } from '../lib/benefitConditionText';
import CardBenefitConditionFields from './CardBenefitConditionFields';
import CardBenefitCapsFields from './CardBenefitCapsFields';
import { capsToRows, rowsToCaps, datesToText, textToDates } from '../lib/benefitRuleForm';
import { useConfirm } from './ConfirmProvider';

// 서버 `src/constants.js` 의 BENEFIT_TYPES 와 같아야 한다. 어긋나면 저장할 때만 400 이 난다.
const BENEFIT_TYPES = ['할인', '적립'];

// 혜택에 걸 수 있는 결제방식(#563). 서버 `PAYMENT_STYLES` 의 **부분집합**이다.
//
// 서버 목록에는 `해당없음` 도 있지만 여기서는 뺀다. 그 값은 카드를 안 쓴 거래에
// 붙는 것이라(실 데이터 50건 전부 비카드), 혜택을 거기 걸면 **어떤 카드 결제에도
// 안 걸리는 혜택**이 된다. 고를 수 있게 두면 사용자가 그걸 만들고 왜 혜택이
// 안 잡히는지 못 찾는다.
//
// `리볼빙` 은 실 데이터가 아직 0건이지만 앱이 다루는 결제방식이라 남긴다.
const BENEFIT_PAYMENT_STYLES = ['일시불', '할부', '리볼빙'];

// 이 혜택이 무엇에 걸리는지. 카테고리와 가맹점 둘 다 선택이라 넷으로 갈린다.
// 목록 한 줄의 머리말. **유형마다 말이 다르다**(#564).
//
// 요율형만 있던 시절에는 `{rate}% {benefit_type}` 하나로 충분했다. 정액구간형은
// 요율이 없으므로 그대로 두면 «0% 적립» 으로 보인다 — 사용자는 혜택이 없는
// 것으로 읽는다.
function headline(b) {
  let rule = null;
  try {
    rule = b.rule_json ? JSON.parse(b.rule_json) : null;
  } catch { /* 깨진 규칙은 요율형으로 본다 */ }

  if (rule && rule.kind === 'flat_monthly') {
    const tiers = Array.isArray(rule.tiers) ? rule.tiers : [];
    if (tiers.length === 0) return `매달 정액 ${b.benefit_type}`;
    const sorted = [...tiers].sort((a, c) => Number(a.min_spend) - Number(c.min_spend));
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    // 금액 표기는 `lib/format.js` 하나로 모은다 — 로케일을 여기서 직접 쓰면
    // 포맷이 갈라진다(테스트가 그 목록을 고정하고 있다).
    //
    // 구간이 하나면 범위로 적지 않는다. "3,000원~3,000원" 은 읽기 나쁘다.
    return sorted.length === 1
      ? `매달 ${formatWon(lo.amount)} ${b.benefit_type}`
      : `매달 ${formatWon(lo.amount)}~${formatWon(hi.amount)} ${b.benefit_type}`;
  }
  return `${b.rate}% ${b.benefit_type}`;
}

function targetLabel(b) {
  if (b.category_name && b.merchant_pattern) return `${b.category_name} · 가맹점 '${b.merchant_pattern}'`;
  if (b.category_name) return b.category_name;
  if (b.merchant_pattern) return `가맹점 '${b.merchant_pattern}'`;
  return '모든 결제';
}

const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

const EMPTY_FORM = {
  // 혜택 유형(#564). 카드마다 구조가 달라도 **공유 스키마 하나**로 다룬다 —
  // 카드별 특수 코드를 두지 않고, 유형이 늘면 여기 선택지가 하나 는다.
  kind: 'rate',
  // 정액구간형일 때만 쓴다. 화면에서 행을 늘리고 줄인다.
  tiers: [],
  // 결제방식 제약(#563). 비우면 결제방식을 가리지 않는다 — 그게 기본이다.
  payment_style: '',
  benefit_type: '할인', rate: '', category_id: '', merchant_pattern: '',
  monthly_cap: '', min_amount: '', memo: '',
  // 건당 상한(#638) · 실적 무관(#636) · 통합 한도 밖(#648).
  max_amount: '', threshold_exempt: false, unified_cap_exempt: false,
  // 창별 한도와 날짜 조건(#638). 값은 전부 문자열로 들고 저장할 때만 규칙으로 바꾼다.
  capRows: [], dates: '',
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

  // 구간 행 편집(#564). #526 의 요율 구간 편집과 같은 모양이라 사용자가 두 번
  // 배우지 않아도 된다.
  const setTier = (i, key, value) =>
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)),
    }));

  const addTier = () =>
    setForm((prev) => ({ ...prev, tiers: [...prev.tiers, { min_spend: '', amount: '', label: '' }] }));

  const removeTier = (i) =>
    setForm((prev) => ({ ...prev, tiers: prev.tiers.filter((_, idx) => idx !== i) }));

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
      // 요율형이 아니어도 `rate` 는 보낸다. 서버 컬럼이 NOT NULL 이고, 규칙을
      // 지웠을 때 요율형으로 되돌아갈 자리이기도 하다.
      rate: form.kind === 'rate' ? Number(form.rate) : 0,
    };

    // 유형별 규칙(#564). 요율형은 규칙 없이 `rate` 컬럼만으로 동작하므로 안 보낸다 —
    // 이미 들어가 있는 혜택과 같은 모양을 유지한다.
    if (form.kind === 'flat_monthly') {
      body.rule = {
        kind: 'flat_monthly',
        tiers: form.tiers
          .filter((t) => String(t.min_spend).trim() !== '')
          .map((t) => ({
            min_spend: Number(t.min_spend),
            amount: Number(t.amount || 0),
            label: (t.label || '').trim() || null,
          })),
      };
    } else {
      // 요율형으로 되돌릴 때 저장된 규칙을 지운다. 안 보내면 기존 규칙이 남아
      // 화면은 요율인데 계산은 정액으로 도는 상태가 된다.
      body.rule = null;
    }

    // ── 창별 한도와 날짜 조건을 규칙에 얹는다(#638).
    //
    // 유형과 무관하게 붙는다 — 요율형에도, 정액구간형에도.
    //
    // **`kind` 없이 보내면 조용히 버려진다.** 읽는 쪽(`ruleOf`)이 `kind` 가 문자열일
    // 때만 규칙으로 인정하므로, 요율형에 한도만 넣으려면 `kind: 'rate'` 를 같이
    // 실어야 한다. 안 실으면 저장은 되는데 계산이 그 한도를 못 본다.
    const caps = rowsToCaps(form.capRows);
    if (caps.error) return { error: caps.error };
    const when = textToDates(form.dates);
    if (when.error) return { error: when.error };

    if (caps.caps || when.dates) {
      const baseRule = body.rule || { kind: 'rate', rate: Number(form.rate) || 0 };
      body.rule = {
        ...baseRule,
        ...(caps.caps ? { caps: caps.caps } : {}),
        ...(when.dates ? { when: { dates: when.dates } } : {}),
      };
    }
    for (const k of ['category_id', 'merchant_pattern', 'monthly_cap', 'min_amount', 'memo']) {
      if (form[k] === '') continue;
      body[k] = k === 'merchant_pattern' || k === 'memo' ? form[k] : Number(form[k]);
    }

    // 결제방식 제약(#563). **빈 값도 보낸다.**
    //
    // 위 반복문처럼 빈 값을 건너뛰면 «가리지 않음» 으로 되돌리는 수정이 서버에
    // 닿지 않는다. `PUT` 이 `{...existing, ...body}` 라서 안 보낸 필드는 옛 값이
    // 남고, 사용자는 제약을 지웠는데 그대로인 화면을 본다.
    body.payment_style = form.payment_style || null;
    // 건당 상한(#638)도 **빈 값을 보낸다.** 위 반복문에 넣으면 상한을 지우는
    // 수정이 서버에 안 닿는다 — `PUT` 이 안 보낸 필드에 옛 값을 남기기 때문이다.
    body.max_amount = form.max_amount === '' ? null : Number(form.max_amount);
    // 체크박스는 빈 칸 처리(위 루프)를 타지 않는다. 안 켜면 false 를 그대로 보낸다.
    body.threshold_exempt = Boolean(form.threshold_exempt);
    body.unified_cap_exempt = Boolean(form.unified_cap_exempt);

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
    // 저장된 규칙을 폼으로 되돌린다(#564). 깨진 JSON 은 없는 것으로 보고 요율형으로
    // 연다 — 여기서 던지면 수정 버튼이 통째로 죽는다.
    let rule = null;
    try {
      rule = b.rule_json ? JSON.parse(b.rule_json) : null;
    } catch { /* 무시하고 요율형으로 연다 */ }
    const kind = rule && typeof rule.kind === 'string' ? rule.kind : 'rate';

    setForm({
      kind,
      tiers: kind === 'flat_monthly' && Array.isArray(rule.tiers)
        ? rule.tiers.map((t) => ({
            min_spend: String(t.min_spend ?? ''),
            amount: String(t.amount ?? ''),
            label: t.label || '',
          }))
        : [],
      benefit_type: b.benefit_type,
      rate: String(b.rate ?? ''),
      category_id: String(b.category_id ?? ''),
      merchant_pattern: b.merchant_pattern || '',
      monthly_cap: String(b.monthly_cap ?? ''),
      min_amount: String(b.min_amount ?? ''),
      max_amount: String(b.max_amount ?? ''),
      threshold_exempt: Boolean(b.threshold_exempt),
      unified_cap_exempt: Boolean(b.unified_cap_exempt),
      capRows: capsToRows(rule),
      dates: datesToText(rule),
      memo: b.memo || '',
      payment_style: b.payment_style || '',
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const save = async () => {
    if (form.kind === 'rate' && form.rate === '') {
      await alert('혜택 비율을 입력해 주세요. 0도 넣을 수 있어요.');
      return;
    }

    if (form.kind === 'flat_monthly') {
      const rows = form.tiers.filter((t) => String(t.min_spend).trim() !== '');
      if (rows.length === 0) {
        await alert('구간을 하나 이상 넣어 주세요.');
        return;
      }
      // 하한이 겹치면 어느 정액을 쓸지 정할 수 없다. 서버도 막지만, 눌러 보고
      // 거부당하는 것보다 그 자리에서 알려 주는 편이 낫다(#526 과 같은 기준).
      const seen = new Set();
      for (const t of rows) {
        const v = String(t.min_spend).trim();
        if (seen.has(v)) {
          await alert(`구간 하한 ${v}이 두 번 있습니다. 하한은 구간마다 달라야 합니다.`);
          return;
        }
        seen.add(v);
      }
    }

    // 한도·날짜는 여기서 규칙으로 바뀐다. 형식이 틀리면 **보내기 전에** 말한다(#638) —
    // 서버도 막지만, 그때는 «저장 실패» 로만 보여서 어느 칸이 문제인지 알 수 없다.
    const built = buildBody();
    if (built.error) {
      await alert(built.error);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/card-benefits/${editingId}`, built);
      } else {
        await api.post('/api/card-benefits', built);
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
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-kind">계산 방식</label>
              <select
                id="benefit-kind"
                value={form.kind}
                onChange={(e) => setField('kind', e.target.value)}
                className={inp}
              >
                <option value="rate">결제액의 몇 %</option>
                <option value="flat_monthly">전월 실적에 따라 매달 정액</option>
              </select>
            </div>

            {form.kind === 'rate' && (
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
            )}

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
              <label className="block text-xs text-caption mb-1" htmlFor="benefit-payment-style">
                이 결제방식일 때만 (선택)
              </label>
              <select
                id="benefit-payment-style"
                value={form.payment_style}
                onChange={(e) => setField('payment_style', e.target.value)}
                className={inp}
              >
                <option value="">결제방식을 가리지 않음</option>
                {BENEFIT_PAYMENT_STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-caption">
                카드사 상당수가 할부를 혜택에서 뺍니다. 그런 혜택이면 «일시불» 을 골라
                두세요. 비워 두면 결제방식을 가리지 않습니다.
              </p>
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

            <CardBenefitConditionFields form={form} setField={setField} inp={inp} />

            <div className="sm:col-span-2">
              <CardBenefitCapsFields
                rows={form.capRows}
                onRowsChange={(rows) => setField('capRows', rows)}
                dates={form.dates}
                onDatesChange={(v) => setField('dates', v)}
                inp={inp}
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

          {form.kind === 'flat_monthly' && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs text-caption leading-relaxed">
                지난달에 얼마를 썼는지에 따라 이번 달에 붙는 금액을 구간으로 넣으세요.
                결제액과 무관하게 <strong className="text-body">한 달에 한 번</strong> 붙습니다 —
                개별 결제에는 0원으로 표시되고, 이번 달 정액은 따로 알려 드려요.
              </p>

              {form.tiers.length === 0 && (
                <p className="text-xs text-caption">등록된 구간이 없어요. 구간을 더해 보세요.</p>
              )}

              <ul className="space-y-2">
                {form.tiers.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[11px] text-caption mb-1" htmlFor={`flat-min-${i}`}>
                        전월 실적 하한
                      </label>
                      <input
                        id={`flat-min-${i}`}
                        type="number"
                        min="0"
                        className={`${inp} w-32`}
                        value={t.min_spend}
                        onChange={(e) => setTier(i, 'min_spend', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-caption mb-1" htmlFor={`flat-amount-${i}`}>
                        이번 달 정액
                      </label>
                      <input
                        id={`flat-amount-${i}`}
                        type="number"
                        min="0"
                        className={`${inp} w-32`}
                        value={t.amount}
                        onChange={(e) => setTier(i, 'amount', e.target.value)}
                      />
                    </div>
                    <div className="flex-1 min-w-32">
                      <label className="block text-[11px] text-caption mb-1" htmlFor={`flat-label-${i}`}>
                        이름 (선택)
                      </label>
                      <input
                        id={`flat-label-${i}`}
                        type="text"
                        className={`${inp} w-full`}
                        value={t.label}
                        onChange={(e) => setTier(i, 'label', e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTier(i)}
                      aria-label={`${i + 1}번째 구간 지우기`}
                      className="text-xs text-caption hover:text-loss-text px-2 py-1.5"
                    >
                      지우기
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={addTier}
                className="text-xs text-brand-text border border-line rounded-control px-3 py-1.5 hover:bg-surface-page"
              >
                + 구간 추가
              </button>
            </div>
          )}

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
              <strong className="text-body">{headline(b)}</strong>
              <span className="text-caption">{targetLabel(b)}</span>
              {conditionText(b) && (
                <span className="text-caption">{conditionText(b)}</span>
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
