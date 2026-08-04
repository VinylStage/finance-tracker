// 거래 → 반복 규칙 초안을 화면 사이로 넘긴다(#280).
//
// 쿼리 문자열로 넘기지 않는다. 가맹점·메모가 주소창과 방문 기록에 남는다 —
// 이 앱은 가계부라 그 값이 곧 사생활이다. 세션 저장소는 탭을 닫으면 사라진다.
//
// 넘긴 쪽이 지우지 않는다. **받는 쪽이 한 번 읽고 지운다.** 안 지우면 다음에
// 설정 화면을 그냥 열었을 때 지난 초안이 떠 있다.
const KEY = 'recurring-draft';

export function putRecurringDraft(form) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(form));
    return true;
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등)에서도 화면이 죽으면 안 된다.
    return false;
  }
}

export function takeRecurringDraft() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    // 깨진 값이 남아 있으면 지우고 없던 것으로 본다.
    try { sessionStorage.removeItem(KEY); } catch { /* 지우기도 실패하면 그냥 둔다 */ }
    return null;
  }
}
