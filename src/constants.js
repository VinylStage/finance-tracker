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
const TRANSACTION_ORIGINS = ['manual', 'installment', 'revolving', 'debt_interest'];

// 거래내역 화면에서 수정·삭제할 수 없는 출처(#268).
//
// origin != 'manual' 을 일괄로 잠그지 않는 이유가 있다. M9 반복거래는 파생
// 거래이지만 사용자가 거래내역에서 고칠 수 있어야 한다 — 공과금처럼 규칙에
// 넣어둔 금액과 실제 청구액이 다를 수 있고, 규칙을 고치면 다음 달부터
// 틀어지기 때문이다.
//
// 아래 셋은 계산 결과라 원본을 고쳐야 값이 맞는다. 거래만 고치면 계산과 어긋난다.
const LOCKED_ORIGINS = ['installment', 'revolving', 'debt_interest'];

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
};

// 이 값이 바뀌면 할부 회차가 다시 계산된다(#269).
//
// 목록을 상수로 둔 이유는 "무엇이 바뀌면 프리뷰가 필요한가" 를 라우트가 아니라
// 한 곳에서 정하기 위해서다. 라우트에 인라인으로 적으면 필드가 늘 때 조용히
// 빠지고, 그러면 프리뷰 없이 대량 변경이 실행된다(ADR 0008 이 막으려는 것).
const INSTALLMENT_SCHEDULE_FIELDS = [
  'total_amount', 'months', 'start_billing_month',
  'payment_method_id', 'purchase_date', 'paid_off_on', 'fee_per_month',
];

module.exports = {
  PAYMENT_STYLES, MAJOR_TYPES, INSTALLMENT_POLICY_TYPES,
  TRANSACTION_ORIGINS, LOCKED_ORIGINS,
  DERIVED_CATEGORIES, INSTALLMENT_SCHEDULE_FIELDS,
};
