import { localYMD } from './date';

// 전역 기간 필터(#272).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//
// 지금은 같은 앱에서 **"이번 달" 의 정의가 화면마다 다르다.** 대시보드는 이번
// 달 고정, 거래내역은 from/to, 기간비교는 자체 기간 모드다. 사용자가 한 화면
// 에서 본 숫자를 다른 화면에서 못 찾는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 프리셋은 전부 달 경계에 맞춘다
//
// "최근 3개월" 을 "오늘로부터 3개월 전" 으로 잡으면 6/4 ~ 8/4 처럼 달 중간에서
// 끊긴다. 그러면 월별 집계가 반쪽짜리 달을 포함하고, 사용자는 6월 합계가 왜
// 작은지 알 수 없다.
//
// 달 경계에 맞추면 모든 프리셋이 **완전한 달의 모음**이 된다. 직접 지정만
// 예외다 — 그건 사용자가 의도한 것이다.
//
// ─────────────────────────────────────────────────────────────────────────
// URL 이 정본이다
//
// #188 에서 wouter 가 들어왔으므로 쿼리스트링에 실으면 새로고침·뒤로가기·
// 북마크가 전부 동작한다. 컴포넌트 state 를 정본으로 두면 새로고침에 사라진다.
//
// 프리셋도 계산된 from/to 로 환원해 URL 에 싣는다. `?preset=this-month` 만
// 실으면 **어제 북마크한 링크가 오늘 다른 기간을 가리킨다.**

export const PRESETS = [
  { key: 'this-month', label: '이번 달' },
  { key: 'last-month', label: '지난 달' },
  { key: 'last-3-months', label: '최근 3개월' },
  { key: 'this-year', label: '올해' },
  // 'month' 와 'custom' 은 `rangeForPreset` 이 null 을 준다 — 누르는 순간 범위가
  // 정해지는 게 아니라 **컨트롤이 열리는** 종류라서다. `presetFor` 도 이 둘은
  // 되짚기 대상에서 자연히 빠진다.
  { key: 'month', label: '월 선택' },
  { key: 'custom', label: '직접 지정' },
];

const PRESET_KEYS = new Set(PRESETS.map((p) => p.key));

// 누르는 순간 범위가 정해지지 않고 **컨트롤이 열리는** 프리셋. `rangeForPreset`
// 이 null 을 주는 것이 정상이다.
//
// 목록으로 빼 두는 이유: 이걸 두지 않으면 "range 가 null 이어도 되는 키" 를
// 테스트가 그때그때 예외 처리하게 되고, 그러면 **구현을 빠뜨린 버튼**도 같은
// 방식으로 통과한다. 어느 쪽인지를 여기서 못 박아 두 방향 다 검사할 수 있게 한다.
export const CONTROL_PRESETS = new Set(['month', 'custom']);

// 조회 종료일 상한. 할부·반복거래가 미래로 뻗기 때문에 미래 자체는 정상이지만,
// 2099년을 찍으면 집계가 빈 달로 가득 찬다.
export const MAX_FUTURE_DAYS = 366;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function firstOfMonth(year, monthIndex) {
  return localYMD(new Date(year, monthIndex, 1));
}

// 말일은 다음 달 0일이다. 윤년(2028-02-29)과 30/31일이 자동으로 맞는다.
function lastOfMonth(year, monthIndex) {
  return localYMD(new Date(year, monthIndex + 1, 0));
}

function partsOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return { year: y, monthIndex: m - 1, day: d };
}

/**
 * 프리셋을 from/to 로 환원한다. 전부 달 경계에 맞는다.
 *
 * @param {string} key
 * @param {string} today 'YYYY-MM-DD' — 테스트가 오늘을 고정할 수 있어야 한다
 * @returns {{from: string, to: string}|null} custom·미지의 키면 null
 */
export function rangeForPreset(key, today = localYMD()) {
  if (!YMD.test(today)) throw new TypeError(`today 는 YYYY-MM-DD 여야 한다: ${today}`);
  const { year, monthIndex } = partsOf(today);

  switch (key) {
    case 'this-month':
      return { from: firstOfMonth(year, monthIndex), to: lastOfMonth(year, monthIndex) };
    case 'last-month':
      return { from: firstOfMonth(year, monthIndex - 1), to: lastOfMonth(year, monthIndex - 1) };
    case 'last-3-months':
      // 이번 달을 **포함한** 3개 달이다. 이번 달을 빼면 사용자가 오늘 쓴 돈이
      // "최근 3개월" 에 안 잡힌다.
      return { from: firstOfMonth(year, monthIndex - 2), to: lastOfMonth(year, monthIndex) };
    case 'this-year':
      return { from: firstOfMonth(year, 0), to: lastOfMonth(year, 11) };
    default:
      return null;
  }
}

/** 'YYYY-MM' 단축형을 그 달 전체로 편다. */
export function rangeForMonth(month) {
  if (!YM.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  return { from: firstOfMonth(y, m - 1), to: lastOfMonth(y, m - 1) };
}

// from/to 가 어느 프리셋과 정확히 일치하는지 되짚는다. URL 로 들어온 기간이
// "이번 달" 과 같으면 버튼이 눌린 상태로 보여야 한다.
function presetFor(from, to, today) {
  for (const { key } of PRESETS) {
    const r = rangeForPreset(key, today);
    if (r && r.from === from && r.to === to) return key;
  }
  // 이번 달·지난 달은 위에서 이미 잡혔다. 남은 '정확히 한 달' 은 월 선택으로 본다.
  // 순서가 뒤집히면 이번 달을 열어도 '월 선택' 이 눌린 것으로 보인다.
  if (monthShorthand({ from, to })) return 'month';
  return 'custom';
}

/**
 * 기간이 쓸 수 있는 값인지 본다.
 *
 * @returns {string|null} 문제가 있으면 사용자 문구, 없으면 null
 */
export function validateRange(from, to, today = localYMD()) {
  if (!YMD.test(from) || !YMD.test(to)) {
    return '날짜 형식이 올바르지 않습니다. 2026-08-04 처럼 입력해 주세요.';
  }
  if (from > to) {
    return '시작일이 종료일보다 뒤입니다. 순서를 바꿔 주세요.';
  }

  const limit = localYMD(new Date(
    partsOf(today).year,
    partsOf(today).monthIndex,
    partsOf(today).day + MAX_FUTURE_DAYS,
  ));
  if (to > limit) {
    return `조회 종료일은 ${limit} 까지 지정할 수 있습니다.`;
  }
  return null;
}

/**
 * URL 쿼리스트링을 기간 상태로 읽는다. **던지지 않는다** — 사용자가 주소창을
 * 직접 고칠 수 있고, 그때 화면이 깨지면 안 된다. 못 읽으면 기본값으로 떨어진다.
 *
 * @param {string} search '?from=...&to=...' 또는 'from=...'
 * @returns {{preset, from, to, includeDerived, invalid: string|null}}
 */
export function parsePeriodQuery(search, today = localYMD()) {
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));

  // 기본값은 포함이다. #269 가 B안(원금+이자를 회차별 거래로 생성, 구매 시점
  // 거래는 사용자가 넣지 않는다)으로 확정됐다. 파생 행이 **실제 지출 기록 그
  // 자체**라서, 빼면 할부 지출이 합계에서 통째로 사라진다.
  const includeDerived = q.get('derived') !== 'off';

  const monthRange = q.has('month') ? rangeForMonth(q.get('month')) : null;
  if (monthRange) {
    return { ...monthRange, preset: presetFor(monthRange.from, monthRange.to, today), includeDerived, invalid: null };
  }

  const from = q.get('from');
  const to = q.get('to');

  if (!from && !to) return { ...defaultRange(today), preset: 'this-month', includeDerived, invalid: null };

  const invalid = validateRange(from || '', to || '', today);
  if (invalid) return { ...defaultRange(today), preset: 'this-month', includeDerived, invalid };

  return { from, to, preset: presetFor(from, to, today), includeDerived, invalid: null };
}

function defaultRange(today) {
  return rangeForPreset('this-month', today);
}

/**
 * 기간 상태를 쿼리스트링으로 쓴다. 프리셋도 from/to 로 환원한다 — 어제 북마크한
 * 링크가 오늘 다른 기간을 가리키면 안 된다.
 *
 * @returns {string} '?from=...&to=...' (기본값이면 빈 문자열)
 */
export function toPeriodQuery({ from, to, includeDerived = true } = {}, today = localYMD()) {
  const params = new URLSearchParams();
  const base = defaultRange(today);

  // 기본값이면 URL 을 더럽히지 않는다. 주소가 짧아야 공유했을 때 읽힌다.
  //
  // **`?month=` 로 줄이지 않는다.** `parsePeriodQuery` 는 그 형태를 읽지만
  // (#272 설계, 주소창을 직접 고치는 경우), 쓰는 쪽은 from/to 하나로 통일한다.
  // 두 형태를 다 내보내면 같은 기간이 두 가지 주소를 갖게 되고, 어느 쪽이
  // 정본인지 정해야 할 자리가 하나 더 생긴다.
  if (from !== base.from || to !== base.to) {
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }
  if (!includeDerived) params.set('derived', 'off');

  const s = params.toString();
  return s ? `?${s}` : '';
}

/** 화면에 쓸 기간 라벨. 프리셋이면 그 이름, 아니면 날짜 범위. */
export function periodLabel({ preset, from, to }) {
  // '월 선택' 은 이름이 아니라 **고른 달**을 보여줘야 한다. 버튼 이름을 그대로
  // 쓰면 3월을 보고 있는데 화면에 '월 선택' 이라고 적힌다.
  if (preset === 'month') {
    const ym = monthShorthand({ from, to });
    if (ym) return `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
  }
  if (preset && preset !== 'custom' && PRESET_KEYS.has(preset)) {
    return PRESETS.find((p) => p.key === preset).label;
  }
  return `${from} ~ ${to}`;
}

/** 월 단축형으로 줄일 수 있으면 'YYYY-MM' 을 준다. 없으면 null. */
export function monthShorthand({ from, to }) {
  if (!YMD.test(from || '') || !YMD.test(to || '')) return null;
  const { year, monthIndex } = partsOf(from);
  if (from !== firstOfMonth(year, monthIndex) || to !== lastOfMonth(year, monthIndex)) return null;
  return `${year}-${pad2(monthIndex + 1)}`;
}
