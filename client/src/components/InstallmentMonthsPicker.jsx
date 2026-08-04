import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

// 할부 개월수 선택(#317).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 드롭다운인가
//
// 지금은 숫자 자유 입력이라 7개월도, 99개월도 들어간다. 카드사가 제공하지 않는
// 개월수를 넣으면 그 뒤 계산이 전부 무의미해진다. 실제 카드 결제창처럼 그 카드가
// 제공하는 개월수만 고르게 한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 그런데 왜 직접 입력을 남겨 두는가 (B안, 2026-08-03 확정)
//
// 사용자가 정책을 아직 다 등록하지 않았거나, 카드사가 새 이벤트를 시작했는데
// 아직 입력하지 않은 상태가 **정상적으로 존재한다.** 드롭다운만 허용하면 그때
// 기록 자체가 막힌다 — 가계부의 1차 목적(기록)이 정책 관리에 종속되면 안 된다.
//
// 직접 입력으로 들어온 개월수는 맞는 정책이 없으므로 **수수료를 계산할 수 없다**
// (이율을 알 방법이 없다). 그래서 원금만 나눈다. 화면은 그 사실을 밝히고 실제
// 청구서를 보고 넣으라고 말한다.
//
// 이슈 본문은 "유이자로 계산" 이라고 적었지만, 그러려면 이율이 있어야 한다.
// 다른 개월수 정책의 이율을 갖다 쓰는 건 추정이고, 추정한 숫자를 사용자 돈으로
// 보여주면 안 된다 — 0 으로 두고 모른다고 말하는 쪽이 정직하다.
// ─────────────────────────────────────────────────────────────────────────

const CUSTOM = '__custom__';

const TYPE_LABEL = {
  무이자: '무이자',
  부분무이자: '부분무이자',
  유이자: '유이자',
};

function optionLabel(o) {
  const type = TYPE_LABEL[o.policy_type] || o.policy_type;
  if (o.policy_type === '무이자') return `${o.months}개월 · ${type}`;
  if (o.policy_type === '부분무이자' && o.free_from_sequence > 0) {
    return `${o.months}개월 · ${type} (${o.free_from_sequence}회차부터 면제)`;
  }
  return `${o.months}개월 · ${type} 연 ${o.annual_rate}%`;
}

export default function InstallmentMonthsPicker({
  value, onChange, paymentMethodId, categoryId, purchaseDate, inputClassName,
}) {
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // 정책에 있는 값을 고른 상태인지, 직접 입력 중인지.
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (!paymentMethodId) {
      setOptions([]);
      setLoaded(false);
      setFailed(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const qs = new URLSearchParams({
          payment_method_id: String(paymentMethodId),
          on: purchaseDate || new Date().toISOString().slice(0, 10),
        });
        if (categoryId) qs.set('category_id', String(categoryId));
        const res = await api.get(`/api/card-policies/months?${qs}`);
        if (!alive) return;
        setOptions(res.data || []);
        setLoaded(true);
        setFailed(false);
      } catch {
        // 조회가 실패해도 입력은 막지 않는다. 자유 입력으로 떨어진다.
        if (!alive) return;
        setOptions([]);
        setLoaded(true);
        setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [paymentMethodId, categoryId, purchaseDate]);

  const hasOptions = options.length > 0;
  // 저장된 값이 지금 정책에 없을 수도 있다(정책이 바뀐 뒤 수정하는 경우).
  // 그때도 값이 사라지면 안 되므로 직접 입력으로 취급한다.
  const valueInOptions = options.some((o) => String(o.months) === String(value));
  const showFreeInput = !hasOptions || custom || (value !== '' && !valueInOptions);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === CUSTOM) {
      setCustom(true);
      onChange('');
      return;
    }
    setCustom(false);
    onChange(v);
  };

  const selected = () => {
    if (custom) return CUSTOM;
    if (value !== '' && !valueInOptions) return CUSTOM;
    return value;
  };

  return (
    <div className="space-y-1">
      {hasOptions && (
        <select
          id="inst-months"
          className={inputClassName}
          value={selected()}
          onChange={handleSelect}
          aria-label="개월수"
        >
          <option value="">선택...</option>
          {options.map((o) => (
            <option key={o.months} value={o.months}>{optionLabel(o)}</option>
          ))}
          <option value={CUSTOM}>직접 입력</option>
        </select>
      )}

      {showFreeInput && (
        <input
          id={hasOptions ? 'inst-months-custom' : 'inst-months'}
          type="number"
          min="2"
          className={inputClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="개월수"
          aria-label={hasOptions ? '개월수 직접 입력' : '개월수'}
          required
        />
      )}

      {/* 왜 자유 입력인지 사실대로 적는다. 이유를 모르면 사용자는 정책을
          등록하면 나아진다는 것도 모른다. */}
      {!paymentMethodId && (
        <p className="text-[11px] text-caption">카드를 고르면 그 카드가 제공하는 개월수를 보여드려요.</p>
      )}
      {paymentMethodId && loaded && !hasOptions && !failed && (
        <p className="text-[11px] text-caption">
          이 카드에 등록된 할부 정책이 없어요. 수수료는 계산하지 못하니 실제 청구서를 보고 넣어 주세요.
        </p>
      )}
      {failed && (
        <p className="text-[11px] text-caption">개월수 목록을 불러오지 못했어요. 직접 넣어 주세요.</p>
      )}
      {hasOptions && showFreeInput && (
        <p className="text-[11px] text-brand-text">
          정책에 없는 개월수예요. 수수료를 계산하지 못하니 실제 청구서를 보고 넣어 주세요.
        </p>
      )}
    </div>
  );
}
