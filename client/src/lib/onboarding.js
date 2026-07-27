// 최초 실행 온보딩(#197).
//
// 플래그는 localStorage 에 둔다. 서버에 온보딩 상태를 담을 컬럼이 없고, "이 브라우저에서
// 처음 열었는가"가 웰컴 플로우가 실제로 묻고 싶은 것이라 로컬 저장이 의미도 맞다.
// 다른 기기에서 열면 다시 보이는 게 맞는 동작이다.
//
// 문구는 docs/VOICE_TONE_GUIDE.md 기준을 따른다 — 질문은 '~할까요?', 서술은 '~합니다',
// 빈 상태는 상태가 아니라 다음 행동을 말한다.

const DONE_KEY = 'ft.onboarding.done';

export const WELCOME_STEPS = [
  {
    id: 'what',
    title: '가계부를 시작해요',
    body: '수입과 지출을 기록하면 이번 달에 얼마를 쓸 수 있는지 바로 보여드려요. 데이터는 이 기기에만 저장됩니다.',
  },
  {
    id: 'first-tx',
    title: '첫 거래를 넣어볼까요',
    body: '거래 화면에서 날짜·금액·카테고리만 넣으면 끝이에요. 카드사 이용내역 파일을 올려 한 번에 등록할 수도 있습니다.',
    cta: { label: '거래 추가하러 가기', href: '/transactions' },
  },
  {
    id: 'budget',
    title: '예산을 정하면 더 잘 보여요',
    body: '설정에서 카테고리별 월 예산을 넣으면 대시보드가 남은 금액과 초과 여부를 알려줍니다. 나중에 정해도 괜찮아요.',
    cta: { label: '설정 열기', href: '/settings' },
  },
];

export function isOnboardingDone() {
  try {
    return window.localStorage.getItem(DONE_KEY) === '1';
  } catch {
    // 접근이 막힌 환경(사파리 프라이빗 등)에서는 "완료됨"으로 본다.
    // 매번 웰컴이 뜨는 것보다 안 뜨는 쪽이 덜 성가시다.
    return true;
  }
}

export function markOnboardingDone() {
  try {
    window.localStorage.setItem(DONE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

// 설정 화면의 '다시 보기'용. 플래그만 지운다.
export function resetOnboarding() {
  try {
    window.localStorage.removeItem(DONE_KEY);
    return true;
  } catch {
    return false;
  }
}

// 웰컴을 띄울지 판정한다.
// 거래가 이미 있으면 처음 쓰는 사람이 아니므로 띄우지 않는다 — 플래그가 지워진
// 브라우저(데이터 삭제, 새 브라우저)에서 기존 사용자에게 웰컴이 뜨는 걸 막는다.
// transactionTotal 이 아직 로딩 중(null/undefined)이면 판정을 미룬다.
export function shouldShowWelcome({ done, transactionTotal }) {
  if (done) return false;
  if (transactionTotal === null || transactionTotal === undefined) return false;
  return Number(transactionTotal) === 0;
}
