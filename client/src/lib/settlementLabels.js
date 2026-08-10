// 결제 방식을 사용자 말로 옮긴다(#289).
//
// `immediate`·`deferred`·`settlement` 는 내부 값이다. 화면에 그대로 나가면
// 사용자는 코드를 읽어야 한다(#231 기준).
//
// 이름만으로는 무엇이 달라지는지 알 수 없어서 **잔액에 어떻게 작용하는지**를
// 함께 둔다. 재분류는 이 작용을 바꾸는 일이라, 그걸 모르면 무엇을 고르는지
// 모르고 고르게 된다.

const SPEC = {
  immediate: {
    label: '즉시 결제',
    effect: '통장에서 바로 빠져요. 체크카드·현금·이체가 여기예요.',
  },
  deferred: {
    label: '카드 사용',
    effect: '통장은 그대로고 카드 미결제액이 늘어요. 신용카드로 긁은 건 여기예요.',
  },
  settlement: {
    label: '카드대금 인출',
    effect: '통장이 줄고 카드 미결제액이 줄어요. 결제일에 빠져나간 금액이에요.',
  },
};

export const SETTLEMENT_OPTIONS = Object.entries(SPEC)
  .map(([value, s]) => ({ value, label: s.label, effect: s.effect }));

export function settlementLabel(value) {
  return SPEC[value] ? SPEC[value].label : '알 수 없음';
}

export function settlementEffect(value) {
  return SPEC[value] ? SPEC[value].effect : '';
}

// '으로' / '로' 를 붙인다. 받침이 없거나 ㄹ 이면 '로', 아니면 '으로' 다.
//
// 라벨이 세 개고 셋의 받침이 다 다르다 — '즉시 결제'(받침 없음) → 로,
// '카드 사용'(ㅇ) → 으로, '카드대금 인출'(ㄹ) → 로. 하나로 박아 두면 어느
// 하나는 반드시 틀린 문장이 되고, 그건 화면에 그대로 보인다.
//
// **따옴표를 건너뛴다.** 화면은 라벨을 '카드 사용' 처럼 감싸서 넘기는데, 맨 끝
// 글자만 보면 따옴표라 한글이 아니고 늘 '로' 로 떨어진다.
export function withRo(word) {
  const text = String(word || '').trim();
  const isHangul = (ch) => ch.charCodeAt(0) >= 0xac00 && ch.charCodeAt(0) <= 0xd7a3;

  let i = text.length - 1;
  while (i >= 0 && !isHangul(text[i])) i--;
  // 한글이 하나도 없으면 붙일 근거가 없다. `word` 를 그대로 쓰면 null 같은
  // 값이 문구에 섞여 나간다.
  if (i < 0) return `${text}로`;

  const jong = (text.charCodeAt(i) - 0xac00) % 28;
  // 0 = 받침 없음, 8 = ㄹ
  return jong === 0 || jong === 8 ? `${text}로` : `${text}으로`;
}
