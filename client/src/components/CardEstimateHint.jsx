import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { estimateReason } from '../lib/cardStrategyView';
import { formatWon } from '../lib/format';

// 입력 중에 매 글자마다 부르지 않는다. 금액은 한 자씩 늘어나므로 디바운스가
// 없으면 50,000 하나 치는 데 다섯 번 부른다.
const DEBOUNCE_MS = 400;

export default function CardEstimateHint({ amount, categoryId, merchant }) {
  const [result, setResult] = useState(null);
  const timer = useRef(null);

  // 이펙트 밖에서 만든다. 안에서 만들면 의존성 배열이 그 이름을 못 봐서
  // 첫 렌더에 ReferenceError 로 죽는다.
  const value = Number(amount);
  const ready = Number.isFinite(value) && value > 0;

  useEffect(() => {
    if (!ready) {
      setResult(null);
      return undefined;
    }

    // 이전 타이머가 있다면 취소
    if (timer.current) {
      clearTimeout(timer.current);
    }

    // 디바운스 적용
    timer.current = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ amount: String(value) });
        if (categoryId) qs.set('category_id', String(categoryId));
        if (merchant) qs.set('merchant', merchant);
        const res = await api.get(`/api/card-strategy/estimate?${qs}`);
        setResult(res);
      } catch {
        // 계산이 실패해도 거래는 입력할 수 있어야 한다. 기록이 계산에 종속되면
        // 안 된다 — 카드를 아직 안 넣은 사용자가 정상적으로 존재한다.
        //
        // 사유를 화면에 내지 않는 것도 같은 이유다. 이건 보조 정보라, 실패를
        // 알리면 사용자가 입력을 멈추고 원인을 찾게 된다.
        setResult(null);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [categoryId, merchant, value, ready]);

  if (!result) {
    return null;
  }

  // 응답에 data 가 없으면 여기서 죽고, 이 힌트 하나가 거래 입력 폼을 통째로
  // 못 뜨게 만든다. 보조 정보가 본 기능을 막으면 안 된다.
  const best = (result.data || [])[0];

  if (!best) {
    return (
      <p className="text-[11px] text-caption">
        등록된 카드가 없어요. 설정에서 카드를 넣으면 어느 카드가 나은지 계산할 수 있어요.
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-1 rounded-control border border-line bg-surface-page px-2.5 py-2">
      <p className="text-[11px] text-body">
        <strong className="text-body">{best.productName}</strong>
        {' · '}
        {best.benefit > 0 ? `약 ${formatWon(best.benefit)}` : '혜택 없음'}
      </p>
      
      {estimateReason(best) && (
        <p className="text-[11px] text-caption">{estimateReason(best)}</p>
      )}
      
      {!result.comparable && (
        <p className="text-[11px] text-caption">
          등록한 카드가 한 장뿐이라 비교한 값은 아니에요.
        </p>
      )}
      
      {result.capUnknown && best.benefit > 0 && (
        <p className="text-[11px] text-caption">
          이번 달 이미 받은 혜택은 계산에 안 들어가서, 실제로는 이보다 적을 수 있어요.
        </p>
      )}
    </div>
  );
}
