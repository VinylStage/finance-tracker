import React from 'react';

export default function CardBenefitConditionFields({ form, setField, inp }) {
  return (
    <>
      <div>
        <label className="block text-xs text-caption mb-1" htmlFor="benefit-max">건당 최대 결제액 (선택)</label>
        <input
          type="number"
          id="benefit-max"
          value={form.max_amount}
          onChange={(e) => setField('max_amount', e.target.value)}
          className={inp}
        />
        <p className="text-xs text-caption mt-1">
          적은 금액 <strong>미만</strong>일 때만 걸린다. 최소 결제액과 같은 값을 두 줄에 넣으면 빈틈 없이 갈린다.
        </p>
      </div>
      
      <div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="benefit-threshold-exempt"
            checked={Boolean(form.threshold_exempt)}
            onChange={(e) => setField('threshold_exempt', e.target.checked)}
          />
          <label className="text-xs text-caption" htmlFor="benefit-threshold-exempt">
            실적 조건 없는 혜택
          </label>
        </div>
        <p className="text-xs text-caption mt-1">
          지난달 실적을 못 채운 달에도 그대로 받는 혜택이면 켠다.
        </p>
      </div>
      
      <div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="benefit-unified-exempt"
            checked={Boolean(form.unified_cap_exempt)}
            onChange={(e) => setField('unified_cap_exempt', e.target.checked)}
          />
          <label className="text-xs text-caption" htmlFor="benefit-unified-exempt">
            카드 통합 한도 밖
          </label>
        </div>
        <p className="text-xs text-caption mt-1">
          구간에 걸린 카드 월 통합 한도와 별개로 주는 혜택이면 켠다.
        </p>
      </div>
    </>
  );
}
