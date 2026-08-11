// 카드 등록 현황 → 보유 카드 수정 폼으로 "이 카드를 고치러 간다" 를 넘긴다(#533).
//
// 등록 현황은 **읽기 전용 화면**이다. "청구주기 미설정" 을 봐도 고치려면 위로 올라가
// 보유 카드 목록에서 그 카드를 다시 찾아야 했다. 카드가 일곱 장이면 일곱 번 찾는다.
//
// 넘기는 값은 **카드 id 하나뿐**이다. 이름·금액 같은 내용은 넘기지 않는다 — 받는 쪽이
// 이미 목록을 들고 있어서 id 만 있으면 폼을 열 수 있고, 가계부 값이 저장소에 남을
// 이유가 없다.
//
// 쿼리 문자열을 쓰지 않는 이유와 "받는 쪽이 한 번 읽고 지운다" 규칙은
// `recurringDraft.js` 와 같다. 안 지우면 다음에 설정 화면을 그냥 열었을 때
// 지난 요청이 살아나 엉뚱한 카드의 폼이 펼쳐진다.
const KEY = 'card-edit-request';

export function putCardEditRequest(cardId) {
  const n = Number(cardId);
  // 0 이나 빈 값을 저장하면 받는 쪽이 "요청 있음" 으로 읽고 못 찾는 카드를 연다.
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    sessionStorage.setItem(KEY, String(n));
    return true;
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등)에서도 화면이 죽으면 안 된다.
    return false;
  }
}

export function takeCardEditRequest() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(KEY);
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    // 깨진 값이 남아 있으면 지우고 없던 것으로 본다.
    try { sessionStorage.removeItem(KEY); } catch { /* 지우기도 실패하면 그냥 둔다 */ }
    return null;
  }
}
