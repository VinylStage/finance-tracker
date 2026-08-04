'use strict';

// transactions.payment_style 허용값의 정본. DB에는 CHECK 제약이 없어(SQLite는
// 기존 테이블에 CHECK를 추가하려면 테이블 재생성이 필요 — 마이그레이션 체계
// 도입(#89) 이후 별도 검토) 애플리케이션 레벨에서 여기 값만 통과시킨다.
const PAYMENT_STYLES = ['일시불', '할부', '리볼빙', '해당없음'];

// categories.major_type 허용값의 정본. '미분류'는 카드 임포트(#106)가 분류
// 실패 시 자동 생성하는 값이라 포함한다.
const MAJOR_TYPES = ['수입', '고정지출', '변동필수', '선택지출', '저축', '부채상환', '미분류'];

// card_installment_policies.policy_type 허용값의 정본(#266).
// 부분무이자는 free_from_sequence 회차부터 이자가 면제되고 그 앞은 고객 부담이다.
// 방향에 주의 — 카드사 안내가 "6개월 부분무이자(4회차부터 면제)" 형태다.
const INSTALLMENT_POLICY_TYPES = ['무이자', '부분무이자', '유이자'];

// transactions.origin 허용값의 정본(#268).
// 'manual' 은 사용자 직접 입력과 CSV·카드 임포트를 포함한다 — 명세서에서
// 가져온 실제 결제라 사용자 소유로 본다.
const TRANSACTION_ORIGINS = ['manual', 'installment', 'revolving', 'debt_interest', 'debt_repayment', 'recurring'];

// 거래내역 화면에서 수정·삭제할 수 없는 출처(#268).
//
// origin != 'manual' 을 일괄로 잠그지 않는 이유가 있다. M9 반복거래는 파생
// 거래이지만 사용자가 거래내역에서 고칠 수 있어야 한다 — 공과금처럼 규칙에
// 넣어둔 금액과 실제 청구액이 다를 수 있고, 규칙을 고치면 다음 달부터
// 틀어지기 때문이다.
//
// 아래 셋은 계산 결과라 원본을 고쳐야 값이 맞는다. 거래만 고치면 계산과 어긋난다.
// debt_repayment 도 여기 넣는다(#287). 상환액은 사용자가 직접 넣은 값이라 M9
// 반복거래(recurring) 쪽에 가까워 보이지만, 거래내역에서 금액을 고치면 원금·이자
// 배분과 그 이후 이자 계산이 전부 어긋난다. 이자 계산의 입력이 되는 값은 원본
// 화면에서만 고칠 수 있어야 한다.
const LOCKED_ORIGINS = ['installment', 'revolving', 'debt_interest', 'debt_repayment'];

// 파생 거래가 쓰는 카테고리의 정본(#269).
//
// "할부 전용 카테고리 신설, `부채상환` 재사용 금지" 는 기존 카테고리(대출원금상환
// 등)를 돌려쓰지 말라는 뜻으로 읽는다 — 할부·리볼빙 수수료·부채 이자는 성격이
// 서로 달라 하나로 뭉치면 카테고리별 분석이 무의미해지기 때문이다. 대분류는
// 셋 다 '부채상환' 을 쓴다. 셋 다 빚에 딸린 지출이고, 새 대분류를 만들면
// MAJOR_TYPES 를 쓰는 예산·집계 화면이 전부 따라 움직여야 한다.
//
// 이름을 여기 모아 두는 이유는 실사용 DB 에 사용자가 이미 만들어 둔 카테고리가
// 있기 때문이다(할부회차금·대출이자). 그 이름과 일치시켜야 같은 뜻의 카테고리가
// 두 벌 생기지 않는다.
const DERIVED_CATEGORIES = {
  installment: { major_type: '부채상환', name: '할부회차금' },
  revolving: { major_type: '부채상환', name: '리볼빙수수료' },
  debt_interest: { major_type: '부채상환', name: '대출이자' },
  // 상환은 원금을 줄이는 실제 현금 유출이다. 이자와 성격이 달라 카테고리를 나눈다.
  debt_repayment: { major_type: '부채상환', name: '대출원금상환' },
};

// 이 값이 바뀌면 할부 회차가 다시 계산된다(#269).
//
// 목록을 상수로 둔 이유는 "무엇이 바뀌면 프리뷰가 필요한가" 를 라우트가 아니라
// 한 곳에서 정하기 위해서다. 라우트에 인라인으로 적으면 필드가 늘 때 조용히
// 빠지고, 그러면 프리뷰 없이 대량 변경이 실행된다(ADR 0008 이 막으려는 것).
// 이 값들이 바뀌면 회차를 다시 만들어야 한다.
// category_id 가 여기 있는 이유: 카테고리가 바뀌면 적용되는 정책이 바뀌고
// (카테고리 예외 → 기본 정책, 또는 그 반대) 그러면 수수료가 달라진다(#316).
const INSTALLMENT_SCHEDULE_FIELDS = [
  'total_amount', 'months', 'start_billing_month',
  'payment_method_id', 'purchase_date', 'paid_off_on', 'fee_per_month',
  'category_id',
];

// audit_log.actor 허용값의 정본(#297).
//
// 사용자가 하지 않은 쓰기가 이미 있다. GET /api/installments 가 만료 할부를
// 완료로 바꾸고(#205), M9 는 서버 기동 시 반복거래를 만든다(#279). 파일 임포트는
// 한 번에 수백 행을 넣는다.
//
// 이 구분이 없으면 실행취소(#300)가 판단할 근거가 없다 — 사용자가 되돌리기를
// 눌렀을 때 자기가 하지 않은 시스템 작업이 취소되면 안 된다.
const AUDIT_ACTORS = ['user', 'system', 'import'];

// audit_log.op 허용값의 정본(#297).
//
// RESTORE 는 백업 복원처럼 DB 를 통째로 갈아끼우는 작업이다. 행 단위로 남기면
// 로그가 데이터보다 커지므로 사실 1행만 남기고, 실행취소 대상에서 제외한다.
const AUDIT_OPS = ['INSERT', 'UPDATE', 'DELETE', 'RESTORE'];
// debts.loan_type 허용값의 정본(#285).
//
// debts.type(용도 — 일반/마이너스통장/학자금/전세자금)과 **다른 축**이다.
// 이쪽은 이자를 어떻게 계산하는가만 정한다. 용도를 바꿨다고 계산이 바뀌면 안 된다.
//
// 신용대출 3종(원리금균등·원금균등·만기일시)은 #284 조사로 산식이 확정돼 있으나
// 이번 사이클에는 넣지 않는다. 쓰는 곳이 없는 유형을 미리 열어 두면 사용자가
// 고를 수는 있는데 계산이 안 되는 상태가 된다.
const LOAN_TYPES = ['general', 'credit_line'];

// 유형만 고르면 계산 방식이 정해져야 한다. 사용자가 일할/복리 여부까지 직접
// 고르게 하면 잘못 고른 조합(마이너스통장인데 월할 단리)이 조용히 저장된다.
// debts.interest_basis / compounds 가 NULL 이면 여기 값을 쓴다.
const LOAN_TYPE_DEFAULTS = {
  // 기존 동작 유지. 월 이자를 잔액 × 연이율 ÷ 12 로 어림한다.
  general: { interest_basis: 'monthly', compounds: 0, requires: [] },
  // 마이너스통장. #284 조사 — 일할(365, 윤년 366)이고 이자가 잔액에 편입된다.
  credit_line: { interest_basis: 'daily', compounds: 1, requires: ['credit_limit'] },
};

// recurring_rules.freq 허용값의 정본(#278).
//
// 기존 규칙은 월 단위 고정이었다. 마이그레이션 기본값이 'monthly' 라 기존 행은
// 그대로 남는다. interval 과 조합해 "2개월마다" 같은 주기를 표현한다.
const RECURRING_FREQS = ['daily', 'monthly', 'yearly'];

// card_products.card_type 허용값의 정본(#306).
//
// 신용/체크는 카드상품에 고정된 속성이다 — 한 상품이 둘 다일 수 없고 도중에
// 바뀌지도 않는다. 그래서 토글도 이력 테이블도 두지 않는다.
//
// 이 값이 M11 의 결제 시점 분리를 가른다: 신용은 이연(결제일에 인출), 체크는
// 즉시 차감이다. 여기서는 기록만 하고 계산은 그쪽 이슈의 몫이다.
const CARD_TYPES = ['신용', '체크'];

// 할인은 결제 금액이 즉시 깎이고, 적립은 나중에 포인트로 돌아온다. 계산은 같아도
// **돈이 언제 손에 오는지가 다르다** — 잔액 추적(M11)에서 둘을 같게 다루면
// 안 들어온 돈을 있는 것으로 센다. 여기서는 구분해 두기만 한다.
const BENEFIT_TYPES = ['할인', '적립'];

module.exports = {
  PAYMENT_STYLES, MAJOR_TYPES, INSTALLMENT_POLICY_TYPES,
  TRANSACTION_ORIGINS, LOCKED_ORIGINS,
  DERIVED_CATEGORIES, INSTALLMENT_SCHEDULE_FIELDS,
  AUDIT_ACTORS, AUDIT_OPS, RECURRING_FREQS, CARD_TYPES, BENEFIT_TYPES,
  LOAN_TYPES, LOAN_TYPE_DEFAULTS,
};
