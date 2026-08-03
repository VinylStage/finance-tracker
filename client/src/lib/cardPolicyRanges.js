// 카드사 할부 정책의 구간 표시(#271).
//
// 저장은 개월수별 행이다(#266 스키마가 months 단일값). 그런데 사용자가 보는
// 카드사 안내는 "2~3개월 무이자" 같은 구간이라, 목록을 행 그대로 보여주면
// 11줄짜리 표가 되고 어느 줄이 어느 안내에 대응하는지 읽을 수 없다.
// 저장은 펼쳐서, 표시는 다시 묶어서.

// 같은 구간으로 묶일 수 있는가를 결정하는 값들. 하나라도 다르면 다른 구간이다.
// 적용 기간까지 포함하는 이유는 같은 개월수라도 연도가 바뀌면 별개 정책이기
// 때문이다 — 묶어 버리면 "언제부터 적용되는 규칙인가" 가 사라진다.
export function signatureOf(p) {
  return [
    p.policy_type,
    Number(p.annual_rate || 0),
    Number(p.free_months || 0),
    p.effective_from,
    p.effective_to || '',
    p.memo || '',
  ].join('|');
}

// 개월수별 행 목록을 연속 구간으로 묶는다.
// 개월수가 끊기면(2,3,7) 구간도 끊는다 — 이어 붙이면 4~6개월에 정책이 있는
// 것처럼 보인다.
export function groupToRanges(policies) {
  const sorted = [...(policies || [])].sort((a, b) => {
    if (a.effective_from !== b.effective_from) return a.effective_from < b.effective_from ? 1 : -1;
    return Number(a.months) - Number(b.months);
  });

  const ranges = [];
  for (const p of sorted) {
    const last = ranges[ranges.length - 1];
    const months = Number(p.months);
    if (last && last.signature === signatureOf(p) && months === last.to_month + 1) {
      last.to_month = months;
      last.ids.push(p.id);
      continue;
    }
    ranges.push({
      signature: signatureOf(p),
      payment_method_id: p.payment_method_id,
      from_month: months,
      to_month: months,
      policy_type: p.policy_type,
      annual_rate: Number(p.annual_rate || 0),
      free_months: Number(p.free_months || 0),
      effective_from: p.effective_from,
      effective_to: p.effective_to || null,
      memo: p.memo || null,
      ids: [p.id],
    });
  }
  return ranges;
}

export function rangeLabel(range) {
  return range.from_month === range.to_month
    ? `${range.from_month}개월`
    : `${range.from_month}~${range.to_month}개월`;
}

// 정책 종류별로 어떤 입력이 의미가 있는가.
//
// 무이자인데 이자율 칸이 떠 있으면 사용자는 무언가 넣어야 하는 줄 안다.
// 서버도 같은 조합을 거부하므로(services/cardPolicy.js) 화면과 규칙이 어긋나지
// 않게 한 곳에서 정한다.
export const POLICY_FIELDS = {
  무이자: { rate: false, free: false },
  부분무이자: { rate: true, free: true },
  유이자: { rate: true, free: false },
};

export function fieldsFor(policyType) {
  return POLICY_FIELDS[policyType] || { rate: false, free: false };
}

// 사용자에게 보이는 한 줄 설명. 내부 필드명을 쓰지 않는다(#231).
export function describePolicy(range) {
  const rate = `연 ${range.annual_rate}%`;
  if (range.policy_type === '무이자') return '무이자';
  if (range.policy_type === '부분무이자') {
    return `앞 ${range.free_months}회차 무이자, 이후 ${rate}`;
  }
  return rate;
}

// 적용 기간 표시. 종료일이 없으면 "부터" 로 끝낸다 — "9999-12-31" 같은
// 내부 사정을 화면에 내보내지 않는다.
export function describePeriod(range) {
  return range.effective_to
    ? `${range.effective_from} ~ ${range.effective_to}`
    : `${range.effective_from}부터`;
}
