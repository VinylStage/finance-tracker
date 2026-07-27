// 마지막 내보내기 시각 기록(#198).
//
// 서버에는 내보내기 이력을 남기는 컬럼도 엔드포인트도 없다. 이슈 인수기준이
// "기존 /api/export, /api/data 활용"으로 범위를 잡고 있어 백엔드를 늘리지 않고
// 브라우저 localStorage 에만 남긴다.
//
// 그래서 이 값은 "데이터가 백업된 시각"이 아니라 "이 브라우저에서 내보내기를 누른
// 시각"이다. 화면 문구도 그렇게 정확히 써야 한다 — 다른 브라우저에서 내보냈거나
// 브라우저 데이터를 지운 경우 값이 없거나 어긋난다. 신뢰를 주려는 화면에서
// 사실보다 큰 주장을 하면 역효과다.

const PREFIX = 'ft.lastExport.';

// 내보내기 종류. 화면의 세 섹션과 1:1 로 대응한다.
export const EXPORT_KINDS = {
  transactions: '거래내역',
  settings: '설정',
  data: '전체 데이터',
};

export function recordExport(kind, nowIso) {
  if (!EXPORT_KINDS[kind]) return false;
  try {
    window.localStorage.setItem(PREFIX + kind, nowIso);
    return true;
  } catch {
    // 저장 실패(프라이빗 모드·용량 초과)는 무시한다. 표시가 안 될 뿐 내보내기 자체는 된다.
    return false;
  }
}

// 한글 목적격 조사. 받침이 있으면 '을', 없으면 '를'.
// 화면 문구가 `${label}을` 처럼 하드코딩돼 있으면 '전체 데이터을' 같은 문장이 나온다
// (실제로 그렇게 나왔다). 라벨이 늘어날 때마다 반복될 문제라 여기서 한 번에 처리한다.
export function withObjectParticle(word) {
  const s = String(word ?? '');
  if (!s) return s;
  const code = s.charCodeAt(s.length - 1);
  // 한글 음절 영역 밖(숫자·영문 등)이면 판정할 수 없으므로 '를'로 둔다.
  if (code < 0xac00 || code > 0xd7a3) return `${s}를`;
  // 음절 코드에서 종성 인덱스가 0 이면 받침이 없다.
  return (code - 0xac00) % 28 === 0 ? `${s}를` : `${s}을`;
}

export function readExport(kind) {
  try {
    return window.localStorage.getItem(PREFIX + kind) || null;
  } catch {
    return null;
  }
}

// 'YYYY-MM-DDTHH:mm:ss.sssZ' 와 현재 시각(ms)을 받아 사람이 읽는 경과 표현으로 바꾼다.
// 7일이 넘으면 상대 표현이 오히려 감이 안 오므로 날짜를 그대로 보여준다.
export function formatSince(iso, nowMs) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const diffMs = nowMs - then;
  // 기기 시각을 바꿨거나 시간대가 어긋나 미래로 계산되는 경우가 실제로 생긴다.
  if (diffMs < 0) return '방금';

  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;

  const day = Math.floor(hour / 24);
  if (day <= 7) return `${day}일 전`;

  return iso.slice(0, 10);
}
