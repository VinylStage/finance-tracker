// 잔액 화면의 표시 계층(#291).
//
// 순수 함수로 두는 이유: 잔액과 카드 미결제액은 서버가 계산해 내려주고
// (accountBalance.js), 여기서는 **그 값을 사람이 읽는 형태로 바꾸기만 한다.**
// 계산이 섞이면 같은 숫자를 두 곳에서 만들게 되고 둘이 어긋난다.
//
// accountStatus 가 돌려주는 값은 **상태 키이지 화면 문구가 아니다.** 문구는
// 화면이 정한다 — 같은 상태라도 목록과 상세에서 다르게 말해야 할 수 있다.

export function formatWon(n) {
  if (n === null || n === undefined || isNaN(n)) {
    return '0원';
  }
  // 로케일을 반드시 명시한다. 생략하면 실행 환경의 로케일을 따라가고,
  // de-DE 같은 환경에서 1.234.567 로 나온다 — 이 앱은 원화 표기 하나만 쓴다.
  // 저장소의 다른 포매터도 전부 'ko-KR' 을 명시하고 있다(TransactionList 등).
  const num = Math.round(Number(n));
  return `${num.toLocaleString('ko-KR')}원`;
}

export function unpaidSummary(cardUnpaid) {
  if (!cardUnpaid) {
    return { total: 0, months: [], unknownCount: 0 };
  }

  const result = {
    total: cardUnpaid.total || 0,
    months: [],
    unknownCount: cardUnpaid.unassigned?.count || 0
  };

  for (const [month, data] of Object.entries(cardUnpaid.byMonth || {})) {
    if (data.unpaid !== 0) {
      result.months.push({ month, unpaid: data.unpaid });
    }
  }

  result.months.sort((a, b) => a.month.localeCompare(b.month));

  return result;
}

export function accountStatus(account) {
  if (!account) {
    return 'no-account';
  }
  if (account.opening_balance == null) {
    return 'no-opening-balance';
  }
  if (account.card_unpaid?.unassigned?.count > 0) {
    return 'unknown-billing';
  }
  if (account.counted === 0 && account.deferred === 0) {
    return 'no-activity';
  }
  return 'ok';
}
