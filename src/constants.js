'use strict';

// transactions.payment_style 허용값의 정본. DB에는 CHECK 제약이 없어(SQLite는
// 기존 테이블에 CHECK를 추가하려면 테이블 재생성이 필요 — 마이그레이션 체계
// 도입(#89) 이후 별도 검토) 애플리케이션 레벨에서 여기 값만 통과시킨다.
const PAYMENT_STYLES = ['일시불', '할부', '리볼빙', '해당없음'];

// categories.major_type 허용값의 정본. '미분류'는 카드 임포트(#106)가 분류
// 실패 시 자동 생성하는 값이라 포함한다.
const MAJOR_TYPES = ['수입', '고정지출', '변동필수', '선택지출', '저축', '부채상환', '미분류'];

module.exports = { PAYMENT_STYLES, MAJOR_TYPES };
