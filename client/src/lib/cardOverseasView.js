import { formatWon } from './format';

// 해외 표시 백필 화면의 문구(#710).
//
// 문구를 컴포넌트 안에서 짓지 않는다. 한곳에 모여 있어야 회귀 테스트가 전수로
// 훑고, 같은 개념을 화면마다 다르게 부르는 일이 없다(#231 · `cardDetailView` 와
// 같은 이유).
//
// **내부 용어를 쓰지 않는다.** `currency` · `country` · `fingerprint` 는 코드의
// 이름이지 사용자의 말이 아니다.

// 무엇을 보고 해외로 판정했는가.
//
// 근거를 감추면 사용자는 건수만 보고 승인하게 된다. ADR 0008 이 프리뷰에
// 요구하는 것은 「몇 건인가」 가 아니라 「무엇이 왜 바뀌는가」 다.
export function evidenceLabel(evidence) {
  if (evidence === 'currency') return '외화 표시';
  if (evidence === 'country') return '국가 표시';
  return '해외 표시';
}

// 프리뷰에 실려 온 계획을 한 줄로 옮긴다. 채울 것이 없으면 `null` —
// 빈 상자를 그리지 않는다.
export function backfillSummary(plan) {
  if (!plan || !plan.count) return null;

  const by = plan.byEvidence || {};
  const parts = [];
  // 근거를 나눠 적는다. 국가 표시 쪽이 오탐 여지가 크므로 사용자가 두 무더기를
  // 따로 볼 수 있어야 한다.
  if (by.currency) parts.push(`외화 표시 ${by.currency}건`);
  if (by.country) parts.push(`국가 표시 ${by.country}건`);

  const shown = (plan.samples || []).length;
  const rest = plan.count - shown;

  return {
    headline: `해외로 표시할 결제 ${plan.count}건 · ${formatWon(plan.amount)}`,
    // 근거가 하나뿐이어도 적는다. 「무엇을 보고 그랬나」 가 빠지면 확인이 아니다.
    evidence: parts.length > 0
      ? `${parts.join(' · ')} — 명세서에 남은 표시를 읽었어요.`
      : '명세서에 남은 표시를 읽었어요.',
    // 「외 N건」 은 목록이 잘렸을 때만 말한다. 안 잘렸는데 적으면 사용자가
    // 못 본 것이 더 있다고 오해한다.
    more: rest > 0 ? `외 ${rest}건` : null,
  };
}
