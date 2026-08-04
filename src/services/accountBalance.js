'use strict';

// 계좌 잔액을 계산한다(#288). DB 를 모르는 순수 함수다 — 호출부가 계좌 행과
// 거래 배열을 읽어 넘긴다.
//
// 잔액을 저장하지 않고 매번 계산하는 것이 이 설계의 핵심이다. 저장하면 거래를
// 고치거나 지울 때마다 갱신해야 하고, 한 번 어긋나면 그 뒤가 전부 틀린다.
//
// 날짜 비교는 문자열로 한다. 'YYYY-MM-DD' 는 사전순이 곧 시간순이고, Date 로
// 바꾸면 UTC 로 해석돼 KST 자정~9시에 하루 어긋난다(FND-20).

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

// 현금흐름 시점(#289). 값이 없으면 immediate 로 본다 — 021 의 DEFAULT 와 같고,
// 구분이 없던 시절의 거래가 그렇게 기록돼 있다.
function settlementOf(tx) {
  return tx?.settlement || 'immediate';
}

// computeBalance(account, transactions) → { balance, counted, skipped, deferred }
//
// opening_date **이전** 거래는 건너뛴다. 그 잔액에 이미 반영돼 있다고 본다.
// 당일은 포함한다 — "이 잔액이 기준이 되는 날짜" 의 거래까지 세는 것이
// 사용자가 통장을 보고 입력하는 방식과 맞다.
//
// **`deferred` 는 잔액에서 빠진다(#289).** 신용카드로 긁은 돈은 아직 통장에
// 있다. 카드대금이 빠질 때 `settlement` 거래가 잔액을 줄인다.
//
// `deferred` 를 `skipped` 에 섞지 않고 따로 센다. `skipped` 는 "날짜가 이상하거나
// 기준일 이전" 이라는 뜻이고, 화면이 그걸 사용자에게 보여줄 이유는 없다.
// `deferred` 는 다르다 — "카드로 쓴 N건은 아직 안 빠졌어요" 를 말해야 한다.
function computeBalance(account, transactions) {
  const opening = Number(account?.opening_balance) || 0;
  const openingDate = account?.opening_date;

  if (!Array.isArray(transactions)) {
    return { balance: opening, counted: 0, skipped: 0, deferred: 0 };
  }

  let balance = opening;
  let counted = 0;
  let skipped = 0;
  let deferred = 0;

  for (const tx of transactions) {
    if (!tx || typeof tx.date !== 'string' || !YMD.test(tx.date)) { skipped++; continue; }
    if (openingDate && tx.date < openingDate) { skipped++; continue; }

    if (settlementOf(tx) === 'deferred') { deferred++; continue; }

    const amount = Number(tx.amount) || 0;
    if (tx.direction === 'in') balance += amount;
    else balance -= amount;
    counted++;
  }

  return { balance, counted, skipped, deferred };
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

module.exports = { computeBalance, availableAmount, cardUnpaid };
