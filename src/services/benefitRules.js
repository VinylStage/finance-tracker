'use strict';

// 혜택 규칙 해석기(#564).
//
// ─────────────────────────────────────────────────────────────────────────
// 하나의 공유 스키마로 간다
//
// 카드마다 혜택 구조가 다르지만 **카드별 특수 코드를 두지 않는다.** 새 카드가
// 기존 유형에 안 맞으면 «이 카드만의 예외» 로 다루지 않고, 먼저 «일반적으로 어떤
// 유형인가» 를 묻는다. 정말 새 유형일 때만 해석기를 하나 더한다 — 그 해석기의
// 이름도 카드가 아니라 **유형**의 이름이다(`flat_monthly`, `package` …).
//
// 그래서 `custom` 같은 탈출구를 두지 않았다. 그것이 카드별 코드가 스며드는
// 문이다. 정말 선언으로 안 되는 카드가 나타나면 그때 연다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 해석기가 두 종류인가
//
// 혜택이 **무엇의 함수인가** 가 유형마다 다르다.
//
//   요율형        benefit = f(거래금액)
//   정액구간형    benefit = g(전월실적 구간)          ← 거래와 무관
//
// 정액구간형은 «전월 30만 이상이면 이번 달 3,000원» 처럼 **월 단위 뭉치**라
// 어느 거래에 붙일지 정할 근거가 없다. 10만원 결제에 붙일 이유도, 1천원 결제에
// 붙일 이유도 없다.
//
// 그래서 범위를 나눈다.
//
//   perTransaction(rule, ctx) — 이 결제에 얼마 붙나
//   perMonth(rule, ctx)       — 이번 달 통째로 얼마 붙나
//
// 정액구간형은 `perTransaction` 이 0 이고 `perMonth` 가 값을 낸다. 그래야 거래별
// 추천이 왜곡되지 않고, 월간 비교에서는 제대로 잡힌다.
//
// 화면은 그 카드를 «이 결제엔 혜택 0원, 다만 이번 달 정액 N원 별도 대상» 으로
// 보여준다. 월 정액을 결제 건수로 나눠 분산하는 방법도 있지만, 그러면 이미 지난
// 결제의 숫자가 뒤에 바뀐다 — 가계부에서 숫자가 사후에 움직이는 것은 피한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 비교는 요율이 아니라 금액으로
//
// 정액과 요율을 한 목록에서 고르려면 **같은 단위**여야 한다. 정액 3,000원과
// 요율 0.7% 는 거래금액을 알아야 비교된다. 그래서 해석기는 전부 **원 단위 금액**을
// 돌려주고, 고르는 쪽은 그 금액을 본다.

// 규칙이 없거나 깨졌을 때 쓰는 값. 옛 행은 `rate` 컬럼만 갖고 있다.
const RATE_KIND = 'rate';

// 저장된 선언을 읽는다. 없거나 깨졌으면 `rate` 컬럼으로 되돌아간다.
//
// **백필하지 않는 대신 읽기에서 떨어뜨린다**(021·026 과 같은 방식). 그래서 이미
// 들어가 있는 혜택은 이 변경으로 값이 달라지지 않는다.
function ruleOf(benefit) {
  const raw = benefit && benefit.rule_json;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.kind === 'string') {
        return parsed;
      }
    } catch {
      // 깨진 JSON 은 없는 것으로 본다. 여기서 던지면 카드 하나 때문에 추천 화면
      // 전체가 죽는다 — 나머지 카드의 계산은 그대로 나가야 한다.
    }
  }
  return { kind: RATE_KIND, rate: Number((benefit && benefit.rate) || 0) };
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

// 실적 구간 목록에서 지금 실적이 속한 구간. 하한 오름차순으로 훑는다.
//
// #526 의 `tierFor` 와 같은 판정이다. 그쪽은 카드 단위 구간표를, 여기는 혜택
// 안에 든 구간을 본다 — 규칙이 같아야 하므로 경계도 같게 `>=` 다.
function tierFor(tiers, spend) {
  let active = null;
  for (const t of tiers) {
    if (spend >= toInt(t.min_spend)) active = t;
    else break;
  }
  return active;
}

function sortedTiers(rule) {
  const list = Array.isArray(rule.tiers) ? rule.tiers : [];
  return [...list].sort((a, b) => toInt(a.min_spend) - toInt(b.min_spend));
}

// ─────────────────────────── 유형별 해석기 ───────────────────────────
//
// 각 해석기는 `perTransaction` 과 `perMonth` 를 갖는다. 해당 없는 쪽은 0 을 낸다.
// `explain` 은 화면이 «왜 이 값인가» 를 말하는 데 쓴다(#231 — 내부 용어를 쓰지 않는다).

const EVALUATORS = {
  // 거래금액에 요율을 곱한다. 옛 행이 전부 이 유형이다.
  [RATE_KIND]: {
    perTransaction(rule, { amount }) {
      const rate = Number(rule.rate) || 0;
      if (rate <= 0) return { benefit: 0, explain: null };
      return {
        benefit: Math.floor(toInt(amount) * rate / 100),
        explain: `적립 ${rate}%`,
      };
    },
    perMonth() {
      return { benefit: 0, explain: null };
    },
  },

  // 전월실적 구간을 채우면 이번 달에 정액이 붙는다. **거래금액과 무관하다.**
  flat_monthly: {
    perTransaction() {
      // 이 결제에 붙는 몫이 없다. 0 을 내는 것이 사실이다 — 억지로 나눠 붙이면
      // 지난 결제의 숫자가 나중에 바뀐다.
      return { benefit: 0, explain: null };
    },
    perMonth(rule, { prevMonthSpend }) {
      const tiers = sortedTiers(rule);
      if (tiers.length === 0) return { benefit: 0, explain: null };

      const tier = tierFor(tiers, toInt(prevMonthSpend));
      if (!tier) {
        const first = tiers[0];
        return {
          benefit: 0,
          explain: `전월 ${toInt(first.min_spend)}원부터 대상이에요`,
        };
      }
      const amount = toInt(tier.amount);
      return {
        benefit: amount,
        explain: tier.label
          ? `${tier.label} · 이번 달 ${amount}원`
          : `이번 달 ${amount}원`,
      };
    },
  },
};

function evaluatorFor(kind) {
  return EVALUATORS[kind] || null;
}

// ─────────────────────────── 항목별 한도 ───────────────────────────
//
// 한도가 두 층이라 자리를 갈랐다(#578).
//
//   항목별 한도    `rule_json.caps[]`                       ← 여기
//   카드 월 통합   `card_threshold_tiers.monthly_cap`       ← 카드 단위 정본
//
// 통합 한도를 `rule_json` 에 넣으면 혜택 줄마다 복제되어 정본이 어디인지 코드가
// 정할 수 없다. 실제로 나라사랑카드가 그 상태로 들어가 항목 29개가 구간 5개마다
// 복제돼 151줄이 됐다.
//
// `window` 를 **값으로** 두는 것이 «카드마다 리셋 주기가 다르다» 를 흡수하는 자리다.
// 카드별 특수 코드 없이 데이터로 갈린다.
//
//   { "window": "transaction", "amount": 4000 }   건당
//   { "window": "day",         "amount": 4000 }   그날 하루
//   { "window": "month",       "amount": 10000 }  그 달
//
// **`day` 는 아직 계산에 걸리지 않는다.** 걸려면 «어느 날 어느 혜택이 얼마 붙었나» 가
// 남아 있어야 하는데 이 저장소는 그것을 저장하지 않는다(#631). 그래서 선언은 받고,
// 적용하지 못한 창을 결과에 실어 **화면이 «아직 반영 못 한다» 를 말할 수 있게** 한다.
// 조용히 무시하면 사용자는 한도가 걸린 줄 안다.
const CAP_WINDOWS = ['transaction', 'day', 'month'];

// 선언에서 한도를 꺼낸다. 없으면 빈 배열이다.
//
// 옛 `card_benefits.monthly_cap` 컬럼은 여기 섞지 않는다. 그 칸에는 지금 **통합
// 한도가 들어가 있는 카드가 있어서**(위 사고) 항목 한도로 읽으면 뜻이 뒤집힌다.
// 컬럼은 호출부가 예전처럼 따로 적용한다.
// 한도에는 금액과 **횟수**가 있다(#638). 둘 다 없는 줄은 한도가 아니라 잡음이라 버린다.
//
//   { "window": "month", "amount": 5000 }             그 달에 5,000원까지
//   { "window": "month", "count": 1 }                 그 달에 **한 번만**
//   { "window": "month", "amount": 5000, "count": 1 } 둘 다
//
// 횟수 한도는 「놀이공원 50% 월 1회」 처럼 금액이 아니라 **적용 횟수**로 끊는
// 혜택을 담는다. 금액으로 흉내낼 수 없다 — 결제액이 얼마든 한 번이면 끝이다.
function capsOf(benefit) {
  const rule = ruleOf(benefit);
  const list = Array.isArray(rule.caps) ? rule.caps : [];
  const out = [];
  for (const c of list) {
    if (!c || !CAP_WINDOWS.includes(c.window)) continue;
    const hasAmount = Number.isFinite(Number(c.amount));
    const hasCount = Number.isFinite(Number(c.count));
    if (!hasAmount && !hasCount) continue;
    const cap = { window: c.window };
    if (hasAmount) cap.amount = toInt(c.amount);
    if (hasCount) cap.count = toInt(c.count);
    out.push(cap);
  }
  return out;
}

/**
 * 항목별 한도로 자른다. **통합 한도는 여기서 다루지 않는다** — 자르는 순서가
 * «항목 → 통합» 이어야 하고, 그 순서를 호출부가 아니라 두 함수의 경계로 고정한다.
 *
 * @param {number} benefit 자르기 전 금액
 * @param {Array<{window: string, amount: number}>} caps
 * @param {object} used 창별로 이미 받은 금액. 아는 창만 넘긴다 (`{ month: 3000 }`)
 * @param {object} times 창별로 이미 적용된 **횟수**(#638). 아는 창만 넘긴다
 *   (`{ month: 1 }`). 횟수 한도가 붙은 창인데 이 값이 없으면 자르지 않고
 *   `unapplied` 에 싣는다 — 금액 누적을 모를 때와 같은 처리다.
 * @returns {{benefit: number, cappedBy: string|null, unapplied: string[]}}
 */
function applyItemCaps(benefit, caps, used = {}, times = {}) {
  let out = toInt(benefit);
  let cappedBy = null;
  const unapplied = [];

  for (const cap of caps) {
    // 횟수 한도(#638). 「월 1회」 는 결제액과 무관하게 **두 번째부터 0** 이다.
    // 금액 한도보다 먼저 본다 — 횟수를 다 썼으면 금액을 볼 것도 없다.
    //
    // 어느 결제에 붙느냐는 훑는 순서가 정한다. 날짜 순으로 도니 그 달의 **첫**
    // 해당 결제에 붙는다.
    //
    // **근거 등급: 추정**(#491 · AUDIT_FRAMEWORK Part 4 D1). 약관으로 확인한 것이
    // 아니다. 카드사가 «그 달 가장 큰 결제» 에 붙여 주는 쪽이면 이 값은 **과소추정**
    // 이 된다 — 작은 결제에 한 번을 써 버리고 큰 결제는 못 받는 것으로 계산한다.
    //
    // 확인에 필요한 것은 「월 N회 혜택이 어느 결제에 적용되는가」 한 줄이다.
    // 첫 결제 기준이면 지금이 맞고, 큰 결제 기준이면 그 달을 다 훑은 뒤 고르는
    // 구조로 바꿔야 한다 — 지금은 한 번에 한 거래씩 보므로 그렇게 못 한다.
    //
    // 「첫 결제」 를 고른 이유는 **되돌아가지 않아서**다. 큰 결제 기준으로 하면
    // 그 달 뒤쪽 거래가 들어올 때마다 앞선 계산이 뒤집혀, 사용자가 이미 본 숫자가
    // 나중에 바뀐다. 가계부에서 숫자가 사후에 움직이는 것은 피한다.
    if (cap.count !== undefined) {
      // 건당 창에 횟수를 붙이면 «이 결제에 한 번» 이라 늘 참이다. 누적이 필요 없다.
      const applied = cap.window === 'transaction' ? 0 : times[cap.window];
      if (applied === undefined || applied === null) {
        unapplied.push(cap.window);
        continue;   // 이 줄의 금액 한도도 같이 못 믿는다 — 누적을 모르는 창이다
      }
      if (toInt(applied) >= cap.count) {
        out = 0;
        cappedBy = cap.window;
        continue;
      }
    }

    if (cap.amount === undefined) continue;   // 횟수만 붙은 한도

    // 건당 한도는 누적이 필요 없다 — 이 결제 하나만 보면 된다.
    const spent = cap.window === 'transaction' ? 0 : used[cap.window];
    if (spent === undefined || spent === null) {
      // 누적을 모르는 창. 자르지 않고 그 사실을 싣는다(#631).
      unapplied.push(cap.window);
      continue;
    }
    const remaining = Math.max(0, cap.amount - toInt(spent));
    if (out > remaining) {
      out = remaining;
      cappedBy = cap.window;
    }
  }

  return { benefit: out, cappedBy, unapplied };
}

// ─────────────────────────────────────────────────────────────────────────
// 특정 날짜에만 붙는 혜택(#638)
//
// 카드사가 흔히 쓴다 — 기념일·창립일에 요율을 올린다.
//
//   하나 나라사랑카드(체크)  편의점 30%  «국군의 날(10/01) · 현충일(06/06)»
//
// 이걸 못 적어서 그 줄은 **데이터에 아예 못 들어갔다.** 조건 없이 넣으면 1년 내내
// 30% 로 계산돼 과대추정이고, 빼면 실제로 받는 혜택이 사라진다. 둘 다 틀리므로
// 넣지 못했다.
//
//   { "kind": "rate", "rate": 0.3, "when": { "dates": ["10-01", "06-06"] } }
//
// `MM-DD` 는 **해마다 돌아온다**. 연도를 적지 않는 건 이 조건이 «올해 10월 1일» 이
// 아니라 «국군의 날» 이기 때문이다. 연도가 붙는 한시 프로모션은 다른 질문이라
// 나중에 `when.range` 로 따로 받는다 — 지금 없는 걸 미리 만들지 않는다.
//
// `when` 이 없으면 날짜를 가리지 않는다. 이미 들어 있는 줄은 그대로 동작한다.
const WHEN_KEYS = ['dates'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];  // 2월은 윤년 기준

// `MM-DD` 목록을 꺼낸다. 없으면 빈 배열 — 「날짜를 가리지 않는다」 는 뜻이다.
function datesOf(benefit) {
  const when = ruleOf(benefit).when;
  if (!when || typeof when !== 'object') return [];
  const list = Array.isArray(when.dates) ? when.dates : [];
  return list.filter((d) => typeof d === 'string' && parseMonthDay(d) !== null);
}

// `MM-DD` 를 [월, 일] 로. 형식이나 값이 틀리면 null.
function parseMonthDay(s) {
  const m = /^(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return [month, day];
}

/**
 * 이 결제일이 혜택의 날짜 조건에 드는가.
 *
 * @param {string[]} dates `datesOf` 의 결과. 비면 조건이 없다는 뜻이라 **항상 참**이다
 * @param {string} date 거래일 `YYYY-MM-DD`
 * @returns {boolean|null} 조건이 있는데 날짜를 모르면 `null` — 「모른다」 를
 *   「맞다」 로도 「아니다」 로도 읽지 않는다. 참으로 읽으면 1년 내내 주는 게 되고,
 *   거짓으로 읽으면 조용히 사라진다. 호출부가 그 사실을 결과에 실어야 한다.
 */
function matchesDates(dates, date) {
  if (!dates || dates.length === 0) return true;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const md = date.slice(5);
  return dates.includes(md);
}

// 이 결제에 붙는 혜택. 모르는 유형은 0 을 낸다 — 던지면 카드 하나가 화면 전체를 죽인다.
function benefitForTransaction(benefit, ctx) {
  const rule = ruleOf(benefit);
  const ev = evaluatorFor(rule.kind);
  if (!ev) return { benefit: 0, explain: null, kind: rule.kind, unknown: true };
  return { ...ev.perTransaction(rule, ctx || {}), kind: rule.kind };
}

// 이번 달 통째로 붙는 혜택. 거래별 추천에는 안 들어가고 월간 비교에만 쓴다.
function benefitForMonth(benefit, ctx) {
  const rule = ruleOf(benefit);
  const ev = evaluatorFor(rule.kind);
  if (!ev) return { benefit: 0, explain: null, kind: rule.kind, unknown: true };
  return { ...ev.perMonth(rule, ctx || {}), kind: rule.kind };
}

// 저장 전 검증. 라우트가 쓴다.
//
// 모르는 유형을 막는 이유는 오타 때문이다. `flat_montly` 로 저장되면 조용히 0 원이
// 되고, 사용자는 혜택이 왜 안 잡히는지 알 수 없다.
function validateRule(rule) {
  if (rule === null || rule === undefined) return null;   // 규칙 없음은 허용(옛 방식)
  if (typeof rule !== 'object' || Array.isArray(rule)) return '혜택 규칙 형식이 올바르지 않습니다.';
  if (typeof rule.kind !== 'string' || !evaluatorFor(rule.kind)) {
    return `모르는 혜택 유형입니다: ${rule.kind}`;
  }
  if (rule.kind === RATE_KIND) {
    const rate = Number(rule.rate);
    if (!Number.isFinite(rate) || rate < 0) return '요율은 0 이상의 숫자여야 합니다.';
  }
  // 항목별 한도(#578). 유형과 무관하게 붙을 수 있다 — 요율형에도, 정액구간형에도.
  if (rule.caps !== undefined && rule.caps !== null) {
    if (!Array.isArray(rule.caps)) return '혜택 한도는 목록이어야 합니다.';
    const seenWindow = new Set();
    for (const c of rule.caps) {
      if (!c || typeof c !== 'object') return '혜택 한도 형식이 올바르지 않습니다.';
      if (!CAP_WINDOWS.includes(c.window)) {
        // 오타를 막는다. `monthly` 로 저장되면 한도가 **조용히 사라진다** —
        // 모르는 유형을 막는 것과 같은 이유다.
        return `모르는 한도 기간입니다: ${c.window} (${CAP_WINDOWS.join(' · ')} 중 하나)`;
      }
      const hasAmount = c.amount !== undefined && c.amount !== null;
      const hasCount = c.count !== undefined && c.count !== null;
      // 둘 다 없으면 «한도가 있다» 고 적어 놓고 아무것도 안 끊는 줄이 된다.
      // 저장은 되는데 뜻이 없어서, 적으려던 값을 빠뜨린 실수로 본다.
      if (!hasAmount && !hasCount) return '한도에는 금액이나 횟수 중 하나는 있어야 합니다.';
      if (hasAmount) {
        const amount = Number(c.amount);
        if (!Number.isFinite(amount) || amount < 0) return '한도는 0 이상의 숫자여야 합니다.';
      }
      if (hasCount) {
        // 횟수 한도(#638). 0회는 «절대 안 준다» 라 혜택을 지우는 것과 같고,
        // 소수는 뜻이 없다.
        const count = Number(c.count);
        if (!Number.isInteger(count) || count < 1) return '횟수 한도는 1 이상의 정수여야 합니다.';
      }
      // 같은 창이 둘이면 어느 것이 맞는지 정할 수 없다. 더 작은 값으로 합치는 것도
      // 방법이지만, 그러면 입력 실수가 조용히 넘어간다.
      if (seenWindow.has(c.window)) return `한도 기간 ${c.window} 이 두 번 있습니다.`;
      seenWindow.add(c.window);
    }
  }

  // 날짜 조건(#638). 한도와 같이 유형과 무관하게 붙는다.
  if (rule.when !== undefined && rule.when !== null) {
    if (typeof rule.when !== 'object' || Array.isArray(rule.when)) {
      return '혜택 조건 형식이 올바르지 않습니다.';
    }
    // 모르는 칸은 막는다. `date` 나 `days` 로 저장되면 조건이 **조용히 사라져**
    // 1년 내내 주는 혜택이 된다 — 모르는 유형·모르는 한도 기간과 같은 이유다.
    for (const k of Object.keys(rule.when)) {
      if (!WHEN_KEYS.includes(k)) return `모르는 혜택 조건입니다: ${k} (${WHEN_KEYS.join(' · ')} 중 하나)`;
    }
    if (rule.when.dates !== undefined) {
      if (!Array.isArray(rule.when.dates) || rule.when.dates.length === 0) {
        // 빈 목록은 «어느 날도 아니다» 가 된다. 그렇게 쓰려는 사람은 없으므로
        // 조건을 지우려던 실수로 본다.
        return '날짜 조건은 날짜가 하나 이상 있는 목록이어야 합니다.';
      }
      for (const d of rule.when.dates) {
        if (parseMonthDay(d) === null) return `날짜 형식이 올바르지 않습니다: ${d} (MM-DD)`;
      }
    }
  }

  if (rule.kind === 'flat_monthly') {
    const tiers = Array.isArray(rule.tiers) ? rule.tiers : null;
    if (!tiers || tiers.length === 0) return '구간을 하나 이상 넣어 주세요.';
    const seen = new Set();
    for (const t of tiers) {
      const min = Number((t || {}).min_spend);
      const amount = Number((t || {}).amount);
      if (!Number.isFinite(min) || min < 0) return '구간 하한은 0 이상의 숫자여야 합니다.';
      if (!Number.isFinite(amount) || amount < 0) return '정액은 0 이상의 숫자여야 합니다.';
      // 하한이 겹치면 어느 정액을 쓸지 정할 수 없다. #526 이 요율 구간에서 쓴 규칙과 같다.
      if (seen.has(min)) return `구간 하한 ${min} 이 두 번 있습니다. 하한은 구간마다 달라야 합니다.`;
      seen.add(min);
    }
  }
  return null;
}

module.exports = {
  RATE_KIND,
  BENEFIT_KINDS: Object.keys(EVALUATORS),
  CAP_WINDOWS,
  WHEN_KEYS,
  ruleOf,
  capsOf,
  datesOf,
  matchesDates,
  applyItemCaps,
  benefitForTransaction,
  benefitForMonth,
  validateRule,
};
