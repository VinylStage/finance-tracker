'use strict';

// 계좌 잔액을 계산한다(#288). DB 를 모르는 순수 함수다 — 호출부가 계좌 행과
// 거래 배열을 읽어 넘긴다.
//
// 잔액을 저장하지 않고 매번 계산하는 것이 이 설계의 핵심이다. 저장하면 거래를
// 고치거나 지울 때마다 갱신해야 하고, 한 번 어긋나면 그 뒤가 전부 틀린다.
//
// 날짜 비교는 문자열로 한다. 'YYYY-MM-DD' 는 사전순이 곧 시간순이고, Date 로
// 바꾸면 UTC 로 해석돼 KST 자정~9시에 하루 어긋난다(FND-20).

// 오늘 날짜만 가져다 쓴다. 로컬시각 기준이라 KST 자정~9시에도 어긋나지 않는다.
const { localYMD } = require('../utils/date');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

// 현금흐름 시점(#289). 값이 없으면 immediate 로 본다 — 021 의 DEFAULT 와 같고,
// 구분이 없던 시절의 거래가 그렇게 기록돼 있다.
function settlementOf(tx) {
  return tx?.settlement || 'immediate';
}

// computeBalance(account, transactions, opts) → { balance, counted, skipped, deferred, upcoming }
//
// opening_date **이전** 거래는 건너뛴다. 그 잔액에 이미 반영돼 있다고 본다.
// 당일은 포함한다 — "이 잔액이 기준이 되는 날짜" 의 거래까지 세는 것이
// 사용자가 통장을 보고 입력하는 방식과 맞다.
//
// **기준일 이후 거래도 빼지 않는다(#382).** "지금 통장에 얼마 있나" 는 오늘까지의
// 거래만 세야 한다. 할부 회차는 미래 날짜로 미리 만들어지므로(#269 B안), 상한이
// 없으면 **할부가 있는 사용자는 남은 회차 전액이 오늘 잔액에서 빠져 있다.**
// 통장을 열어 본 숫자와 앱의 숫자가 달라지고, 왜 다른지 알 방법이 없다.
//
// 그 거래들은 사라지는 게 아니라 `upcoming` 으로 센다. 예정 인출이고, 미래 잔액
// 추이(#291)가 보여줄 몫이다.
//
// **`deferred` 는 잔액에서 빠진다(#289).** 신용카드로 긁은 돈은 아직 통장에
// 있다. 카드대금이 빠질 때 `settlement` 거래가 잔액을 줄인다.
//
// 세 카운터를 따로 두는 이유는 화면이 각각 다르게 말해야 하기 때문이다.
// `skipped` 는 "날짜가 이상하거나 기준일 이전" 이라 사용자에게 보여줄 이유가
// 없다. `deferred` 는 "카드로 쓴 N건은 아직 안 빠졌어요", `upcoming` 은
// "앞으로 빠질 N건" 이다.
function computeBalance(account, transactions, opts = {}) {
  const opening = Number(account?.opening_balance) || 0;
  const openingDate = account?.opening_date;
  // 기준일. 호출부가 안 주면 오늘이다. 테스트가 날짜를 고정할 수 있어야 한다.
  const asOf = typeof opts.asOf === 'string' && YMD.test(opts.asOf) ? opts.asOf : localYMD();

  if (!Array.isArray(transactions)) {
    return { balance: opening, counted: 0, skipped: 0, deferred: 0, upcoming: 0, asOf };
  }

  let balance = opening;
  let counted = 0;
  let skipped = 0;
  let deferred = 0;
  let upcoming = 0;

  for (const tx of transactions) {
    if (!tx || typeof tx.date !== 'string' || !YMD.test(tx.date)) { skipped++; continue; }
    if (openingDate && tx.date < openingDate) { skipped++; continue; }

    // deferred 판정을 미래 판정보다 먼저 한다. 미래 날짜의 카드 사용은 아직
    // 통장과 무관하므로 upcoming(통장에서 빠질 것)이 아니라 deferred 다.
    if (settlementOf(tx) === 'deferred') { deferred++; continue; }

    if (tx.date > asOf) { upcoming++; continue; }

    const amount = Number(tx.amount) || 0;
    if (tx.direction === 'in') balance += amount;
    else balance -= amount;
    counted++;
  }

  return { balance, counted, skipped, deferred, upcoming, asOf };
}

// cardUnpaid(transactions) → { total, byMonth, unassigned }
//
//   카드 미결제액 = Σ(deferred) − Σ(settlement)
//
// `total` 은 청구월과 무관하게 전체를 센다. `byMonth` 는 화면이 "4월 청구분
// 얼마" 를 보여주기 위한 분해다.
//
// **`total` 을 0 에서 자르지 않는다.** 음수가 나오면 정산이 사용 기록보다 많다는
// 뜻이고, 그건 데이터가 어긋났다는 신호다. 감추면 사용자가 알 방법이 없다.
//
// `billing_month` 가 없는 건은 `unassigned` 로 뺀다. 청구 주기를 모르는 카드가
// 있다는 뜻이고(#290 의 폴백), 화면이 "청구월을 모르는 거래 N건" 을 안내해야 한다.
function cardUnpaid(transactions) {
  const byMonth = {};
  const unassigned = { deferred: 0, settled: 0, count: 0 };
  let total = 0;

  if (!Array.isArray(transactions)) return { total: 0, byMonth, unassigned };

  for (const tx of transactions) {
    const kind = settlementOf(tx);
    if (kind !== 'deferred' && kind !== 'settlement') continue;

    const amount = Number(tx.amount) || 0;
    total += kind === 'deferred' ? amount : -amount;

    const month = typeof tx.billing_month === 'string' && YM.test(tx.billing_month)
      ? tx.billing_month
      : null;

    if (month === null) {
      unassigned.count++;
      if (kind === 'deferred') unassigned.deferred += amount;
      else unassigned.settled += amount;
      continue;
    }

    if (!byMonth[month]) byMonth[month] = { deferred: 0, settled: 0, unpaid: 0 };
    if (kind === 'deferred') byMonth[month].deferred += amount;
    else byMonth[month].settled += amount;
    byMonth[month].unpaid = byMonth[month].deferred - byMonth[month].settled;
  }

  return { total, byMonth, unassigned };
}

// 마이너스통장은 잔액이 음수여도 한도까지 쓸 수 있다. 화면이 "쓸 수 있는 돈" 을
// 말하려면 잔액과 별개의 값이 필요하다.
function availableAmount(account, balance) {
  const limit = account?.credit_limit;
  if (limit === null || limit === undefined) return balance;
  return balance + (Number(limit) || 0);
}

// projectBalance(account, transactions, opts) → { asOf, start, months, negativeFrom, includes }
//
// 예정된 인출만 반영해 앞으로의 잔액을 월 단위로 그린다(#291).
//
// ─────────────────────────────────────────────────────────────────────────
// 무엇을 반영하고 무엇을 반영하지 않는가
//
// 반영: **미래 날짜 거래**(할부 회차가 여기 들어온다 — #269 B안이 회차를 미리
// 만든다), **아직 안 빠진 카드값**(`deferred` 를 `billing_month` 로 묶는다).
//
// 반영하지 않음: **대출 상환 스케줄.** 상환은 사용자가 실제로 넣을 때 기록되고
// (`debt_repayments`), 앞으로의 스케줄은 데이터로 존재하지 않는다. 잔액·이율로
// 추정할 수는 있으나 그건 이 함수가 아니라 대출 쪽의 계산이다. **앞으로의 지출**
// 도 반영하지 않는다 — 알 수 없다.
//
// 이 목록을 `includes` 로 돌려주는 이유: 화면이 "무엇을 반영했는지" 를 사용자에게
// 말해야 한다. 예측을 단정적으로 제시하면 사용자가 그대로 믿고 손해를 본다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 월 단위인가
//
// 카드값이 빠지는 날짜는 카드상품의 결제일에 달렸는데(#290), 거래 하나하나가
// 어느 카드인지까지 이어 붙이면 계산이 무거워지고 정확도는 결제일 설정 여부에
// 좌우된다. **월 단위면 "9월에 얼마가 빠진다" 까지는 확실히 말할 수 있다.**
// 일 단위가 필요해지면 그때 카드상품을 조인한다.
function projectBalance(account, transactions, opts = {}) {
  const asOf = typeof opts.asOf === 'string' && YMD.test(opts.asOf) ? opts.asOf : localYMD();
  const horizon = Number.isInteger(opts.horizonMonths) && opts.horizonMonths > 0
    ? opts.horizonMonths
    : 6;

  const base = computeBalance(account, transactions, { asOf });
  const includes = ['scheduled', 'card-unpaid'];
  const result = { asOf, start: base.balance, months: [], negativeFrom: null, includes };

  if (!Array.isArray(transactions)) return result;

  // 월별 순유출입을 모은다. 부호는 잔액 기준이다 — 나가면 음수.
  const delta = new Map();
  const bump = (month, amount) => {
    if (!YM.test(month)) return;
    delta.set(month, (delta.get(month) || 0) + amount);
  };

  const openingDate = account?.opening_date;
  for (const tx of transactions) {
    if (!tx || typeof tx.date !== 'string' || !YMD.test(tx.date)) continue;
    if (openingDate && tx.date < openingDate) continue;

    const amount = Number(tx.amount) || 0;
    const kind = settlementOf(tx);

    if (kind === 'deferred') {
      // 카드값은 **쓴 달이 아니라 청구월에** 빠진다. 청구월을 모르면 언제
      // 빠질지 알 수 없으므로 추이에 넣지 않는다 — 넣으면 없는 확신을 만든다.
      if (typeof tx.billing_month === 'string' && tx.billing_month > asOf.slice(0, 7)) {
        bump(tx.billing_month, -amount);
      }
      continue;
    }

    // 이미 지난 거래는 start 에 반영돼 있다.
    if (tx.date <= asOf) continue;

    bump(tx.date.slice(0, 7), tx.direction === 'in' ? amount : -amount);
  }

  // 기준월 다음 달부터 horizon 개월. 변동이 없는 달도 그린다 — 빈 달을 건너뛰면
  // 화면에서 시간 간격이 왜곡된다.
  const [y, m] = asOf.slice(0, 7).split('-').map(Number);
  let running = base.balance;

  for (let i = 1; i <= horizon; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const change = delta.get(month) || 0;
    running += change;
    result.months.push({ month, change, balance: running });

    // **마이너스로 도는 첫 시점이 이 기능의 실질적 가치다.** 한도가 있는
    // 계좌는 한도까지가 여유이므로 그 기준으로 판정한다.
    if (result.negativeFrom === null && availableAmount(account, running) < 0) {
      result.negativeFrom = month;
    }
  }

  return result;
}

module.exports = { computeBalance, availableAmount, cardUnpaid, projectBalance };
