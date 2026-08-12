import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

// 흐름 분석 달력뷰의 카드 선택(#485).
//
// 기간 선택(`HeatmapPeriodPicker`, #273)과 나란히 선다. 그쪽이 «이 그래프만» 이라고
// 라벨에 못 박은 것과 같은 규칙을 따른다 — 위의 12개월 차트는 전체 합계 그대로다.
// 한 섹션 안에서 어떤 그래프는 걸러지고 어떤 그래프는 안 걸러지므로, 무엇에
// 걸리는지 화면이 직접 말해야 한다.
//
// **«미지정» 을 선택지에 둔다.** 실 데이터의 다섯에 하나가 카드가 안 붙은 거래다.
// 그 덩어리를 볼 방법이 없으면 카드별 합이 전체와 안 맞는 이유를 알 수 없고,
// 사용자는 어느 카드의 내역이 빠졌는지 찾아 헤맨다.
export default function HeatmapCardPicker({ value, onChange }) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    let cancelled = false;
    // 카드 목록은 이 컴포넌트가 직접 읽는다. CardBenefitSection 과 같은 방식이다 —
    // 대시보드가 안 쓰는 데이터를 위로 올려 전달하면 그쪽이 이 화면을 알게 된다.
    //
    // 비활성 카드도 받는다. 지난달까지 쓰다 해지한 카드의 내역이 목록에서 사라지면
    // 그 기간을 볼 수 없다.
    api.get('/api/card-products?include_inactive=1')
      .then((res) => { if (!cancelled) setCards(res.data || []); })
      .catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-[11px] text-caption" htmlFor="heat-card">어느 카드</label>
      <select
        id="heat-card"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-surface border border-line-strong rounded-control px-2 py-1 text-ink focus:outline-none focus:border-brand-fill"
      >
        <option value="">전체</option>
        <option value="none">미지정</option>
        {cards.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.product_name} · {c.issuer}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-caption">이 달력만</span>
    </div>
  );
}
