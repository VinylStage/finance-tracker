// 거래 배열을 날짜별 합계로 묶는다. 달력뷰가 셀마다 그날의 수입·지출을 쓰기 위해
// 필요한 형태다.
//
// 거래가 없는 날은 키를 만들지 않는다. { income: 0, expense: 0 } 을 넣으면
// "안 썼다" 와 "기록을 안 했다" 가 화면에서 같아 보인다.
//
// 잘못된 원소는 throw 하지 않고 건너뛴다. 거래 하나가 깨져 달력 전체가 안 그려지면
// 사용자는 무엇이 문제인지 알 수 없다.
export function bucketByDay(transactions) {
  if (!Array.isArray(transactions)) return {};

  const result = {};

  for (const tx of transactions) {
    if (!tx || typeof tx.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      continue;
    }

    const amount = Number(tx.amount) || 0;

    if (!result[tx.date]) {
      result[tx.date] = { income: 0, expense: 0, count: 0 };
    }

    // 수입만 갈라내고 나머지 major_type 은 전부 지출로 센다.
    if (tx.major_type === '수입') {
      result[tx.date].income += amount;
    } else {
      result[tx.date].expense += amount;
    }
    result[tx.date].count += 1;
  }

  return result;
}
