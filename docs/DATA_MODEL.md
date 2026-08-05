# 데이터 모델 문서

## 테이블 목록

| 테이블 이름 | 목적 | 주요 컬럼 |
|-------------|------|-----------|
| payment_methods | 결제수단 정보 저장 | id, name, type, is_active, created_at |
| categories | 지출/수입 카테고리 저장 | id, major_type, name, monthly_budget, is_active |
| transactions | 일시불 및 일반적인 거래 내역 저장 | id, date, category_id, amount, payment_method_id, payment_style, merchant, memo, installment_id, origin, origin_ref_table, origin_ref_id, origin_seq, origin_seq_total, created_at |
| installments | 분할 결제 정보 저장 | id, purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month, status, paid_off_on |
| revolving_history | 신용카드 회계 기록 저장 | id, month, carried_balance, new_charge, paid_amount, interest, next_carried_balance, payment_method_id |
| debts | 부채 정보 저장 | id, name, balance, annual_rate, type, memo, loan_type, credit_limit, interest_basis, compounds, interest_day, updated_at |
| debt_rate_history | 부채 금리의 시점별 이력 | id, debt_id, annual_rate, effective_from, effective_to, memo, created_at |
| debt_repayments | 부채 부분상환 이력 | id, debt_id, repaid_on, amount, principal_portion, interest_portion, balance_before, balance_after, memo, created_at |
| debt_interest_log | 부채 이자 로그 기록 | id, debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after, memo, created_at |
| app_settings | 애플리케이션 설정 정보 저장 | key, value |
| savings_products | 저축 상품 정보 저장 | id, name, monthly_contribution, start_date, maturity_date, expected_payout, category_id, status |
| recurring_rules | 반복 거래 규칙 | id, category_id, merchant, amount, day_of_month, freq, interval, starts_on, ends_on, month_of_year, last_run_on, payment_method_id, payment_style, memo, is_active |
| recurring_occurrences | 반복 규칙의 발생일별 처리 기록 | id, rule_id, occurred_on, status, transaction_id, created_at |
| recurring_rule_months | 월 단위 처리 기록(구형). 013 이 발생일 단위로 옮겼고 롤백 여지로 남겨 둠 | id, rule_id, year_month, status, transaction_id |
| audit_log | 모든 쓰기의 전후 값 | id, ts, actor, action_id, action_label, table_name, row_id, op, before_json, after_json, undone_at |
| _audit_context | 트리거가 읽을 현재 요청 컨텍스트(단일 행) | id, actor, action_id, action_label |
| accounts | 통장·계좌 | id, name, type, opening_balance, credit_limit, is_active |
| card_products | 카드 상품. payment_methods 아래에 붙는다 | id, payment_method_id, issuer, product_name, card_type, annual_fee, prev_month_threshold, billing_cycle_day, statement_close_day, memo |
| card_benefits | 카드별 할인·적립 조건 | id, card_product_id, category_id, merchant_pattern, benefit_type, rate, monthly_cap, min_amount, memo |
| card_policies | 카드사·기간별 무이자 할부 정책 | id, payment_method_id, from_month, to_month, free_from_sequence, category_id |
| duplicate_dismissals | 중복 후보로 뜬 것을 사용자가 아니라고 한 기록 | id, key, dismissed_at |

## 테이블 관계

- `transactions.category_id` → `categories.id` (1:N)
- `transactions.payment_method_id` → `payment_methods.id` (1:N)
- `transactions.installment_id` → `installments.id` (1:N)
- `installments.payment_method_id` → `payment_methods.id` (1:N)
- `revolving_history.payment_method_id` → `payment_methods.id` (1:N)
- `debt_interest_log.debt_id` → `debts.id` (1:N)
- `debt_rate_history.debt_id` → `debts.id` (1:N)
- `debt_repayments.debt_id` → `debts.id` (1:N)
- `savings_products.category_id` → `categories.id` (1:N)
- `recurring_occurrences.rule_id` → `recurring_rules.id` (1:N, ON DELETE CASCADE)
- `recurring_occurrences.transaction_id` → `transactions.id` (1:1)
- `card_products.payment_method_id` → `payment_methods.id` (1:N — **UNIQUE 가 아니다**)
- `card_benefits.card_product_id` → `card_products.id` (1:N, ON DELETE CASCADE)
- `transactions.card_product_id` → `card_products.id` (1:N)

## 파생 거래 (#268, #269)

`transactions` 의 일부 행은 사용자가 입력한 것이 아니라 할부·리볼빙·부채이자
원본에서 계산돼 만들어진다. 그 행을 식별하는 것이 `origin` 계열 컬럼이다.

| 컬럼 | 의미 |
|---|---|
| `origin` | `manual` / `installment` / `revolving` / `debt_interest` / `debt_repayment` |
| `origin_ref_table` | 원본 테이블명 (`installments`, `revolving_history`, `debt_interest_log`, `debt_repayments`) |
| `origin_ref_id` | 원본 행 id |
| `origin_seq` | 할부 회차 번호. 할부에만 값이 있다 |
| `origin_seq_total` | 실제로 청구되는 총 회차 수. 조기 완납이면 개월수보다 작다 |

- `origin != 'manual'` 인 행은 거래내역 화면에서 수정·삭제할 수 없다. 원본을 고쳐야 한다
- 원본이 삭제되면 딸린 파생 거래도 같은 트랜잭션에서 삭제된다. 고아 행을 남기지 않는다
- 파생 거래 생성·재생성은 `src/services/derivedTransactions.js` 한 곳을 거친다

### 집계에서의 취급

파생 거래는 **현재 어떤 합계에도 더해지지 않는다.** 세 경로 모두 이미 다른
방식으로 집계에 들어가 있어서, 그대로 더하면 이중계산이 된다.

| 출처 | `payment_style` | 제외되는 이유 |
|---|---|---|
| 할부 | `할부` | 대시보드가 `installmentsDue` 로 따로 센다 |
| 리볼빙 수수료 | `리볼빙` | 수수료는 다음 달 이월 잔액에 얹히는 발생액이다 |
| 부채 이자 | `해당없음` | 이자가 부채 잔액에 자본화된다. 실제 상환이 따로 기록된다 |

**예외: 부채 상환(`debt_repayment`)은 지출로 센다.** 이자와 달리 실제로 통장에서 돈이
나가는 사건이다. 이자 쪽을 뺀 것이 곧 "상환만 센다" 는 뜻이다(#287).

앞의 둘은 `EXPENSE_CASE` 의 `payment_style` 조건이 이미 걸러내고, 부채 이자는
`origin` 으로 따로 제외한다(`src/utils/aggregation.js`).

집계 기준을 파생 거래 쪽으로 옮기는 것은 화면 전체가 걸린 별도 결정이라 M7·M11 에서 다룬다.

## 대출 유형과 금리 이력 (#285)

### `debts.type` 과 `debts.loan_type` 은 다른 축이다

| 컬럼 | 뜻 | 값 |
|---|---|---|
| `type` | 사용자에게 보이는 **용도** 분류 | 일반 / 마이너스통장 / 학자금 / 전세자금 |
| `loan_type` | **이자 계산 방식** | `general` / `credit_line` |

학자금대출과 전세자금대출은 용도가 다를 뿐 계산은 같을 수 있다. 한 컬럼으로 합치면
용도를 바꾸는 순간 계산이 바뀐다. 다만 마이그레이션 011 이 `type='마이너스통장'` 인
행은 `credit_line` 으로 옮긴다 — 그렇게 적어 둔 것 자체가 계산 방식에 대한 의사표시다.

### 유형별 계산 설정

`interest_basis`(일할/월할)와 `compounds`(원금 편입)가 유형을 가르는 두 축이다(#284 조사).

| `loan_type` | `interest_basis` | `compounds` | 필수 필드 |
|---|---|---|---|
| `general` | `monthly` | 0 | — |
| `credit_line` | `daily` | 1 | `credit_limit` |

두 컬럼은 **NULL 을 허용한다.** NULL 이면 유형 기본값을 쓴다 — `NOT NULL DEFAULT 0`
으로 두면 "아직 안 고름" 과 "복리 아님" 이 같은 값이 되어 기본값을 적용할 자리가
사라진다. 마이너스통장을 넣어도 조용히 단리가 된다.

### 금리 이력이 왜 별도 테이블인가

실제 사용 중인 마이너스통장이 **3개월 주기 변동금리**다. `annual_rate` 한 칸만 두면
금리가 바뀐 뒤 과거 이자를 재현할 수 없다.

```
잔액 3,566,196 / 4.17% 30일 + 4.55% 30일
  시점별 적용   12,222 + 13,336 = 25,558   ← 맞는 값
  현재 금리 소급              = 26,673   ← 1,115원 어긋남
```

`card_installment_policies` 의 `effective_from` / `effective_to` 와 같은 모양을 쓴다.

- **정본은 `debt_rate_history`** 다. `debts.annual_rate` 는 거기서 파생된 **현재** 금리이며,
  목록 조회가 조인 없이 읽기 위한 것이다
- 두 값이 어긋나지 않도록 쓰기 경로를 `services/debtRate.setDebtRate()` 하나로 모은다.
  `PUT /api/debts/:id` 는 금리를 건드리지 않는다
- `debt_interest_log.rate_at_time` 은 **감사 기록**이지 조회 원천이 아니다. 이자를 기록한
  시점에만 남아서 임의의 과거 날짜에 어떤 금리였는지 알 수 없다

### 잔액 타임라인 — 이자와 상환을 합친다 (#287)

`debts.balance` 를 직접 고치면 잔액은 바뀌지만 **언제 얼마를 갚았는지가 남지 않는다.**
이자 계산은 잔액 이력에 의존하므로(특히 복리) 상환 이력이 없으면 과거 이자를 재계산할 수 없다.

`debt_interest_log`(이자 발생)와 `debt_repayments`(상환)를 시점순으로 합치면 잔액
타임라인이 되고, 그것이 `services/interest/creditLine.accrueInterest()` 의 입력이다.
두 테이블이 `balance_before` / `balance_after` 를 같은 모양으로 남기는 이유가 이것이다.
같은 날짜에 둘 다 있으면 **이자가 먼저**다 — 이자가 붙고 나서 갚는 것이 실제 순서다.

**원금분만 잔액에서 뺀다.** 이자분은 이미 잔액에 편입돼 있던 이자를 갚는 것이라 전액을
빼면 이중으로 줄어든다. 다만 이 앱은 이자를 잔액에 편입하므로 실무상 대부분 전액이
원금분이다 — 배분 칸은 사용자가 명세서에서 확인해 넣을 수 있도록 남겨 둔 자리다.

## 테이블 분리 이유 요약

- `transactions`: 일반적인 거래 내역을 저장
- `installments`: 분할 결제 정보를 독립적으로 관리하여 결제 시스템과 분할 상환 로직을 분리
- `revolving_history`: 신용카드 회계 기록을 저장하며, 이는 단순 거래 내역이 아닌 특정 기간의 회계 정보를 필요로 함

## 감사 로그 — 트리거로 캡처한다 (#296, #298, #299)

쓰기를 남기는 방법은 두 가지였다. 라우트가 직접 기록하거나, DB 트리거가 잡거나.
**트리거를 골랐다.** 라우트 기록은 새 라우트를 쓰는 사람이 한 줄 빠뜨리면 그 경로만
조용히 안 남는다 — 빠뜨려도 구멍이 안 나는 구조가 필요했다.

트리거는 JS 상태를 볼 수 없다. 그래서 `_audit_context` 단일 행 테이블이 있다. 요청
미들웨어가 `actor`/`action_id` 를 그 행에 밀어넣고, 트리거가 그것을 읽어 `audit_log`
에 적는다.

| 컬럼 | 왜 필요한가 |
|---|---|
| `actor` | `user` / `system` / `import`. 조회마다 도는 시스템 스윕(#205)이 실행취소 후보에 오르면 안 된다 |
| `action_id` | 한 요청이 만드는 모든 행이 같은 값을 갖는다. **실행취소의 단위**가 이것이다 |
| `action_label` | 선택. 안 붙여도 로그는 남는다 — 빠뜨려도 구멍이 안 나는 구조의 일부다 |
| `undone_at` | 되돌린 시각. 두 번 되돌리는 것을 막는다 |

**되돌리기는 `before_json` 을 되쓴다.** 쓰기 전에 현재 행이 `after_json` 과 같은지
보고, 다르면 거부한다 — 그 사이 누군가(또는 스윕이) 또 바꾼 것이고, 그대로 되돌리면
그 변경을 **조용히 덮어쓴다.** 조용히 덮어쓰는 게 최악이라 거부한다.

되돌리기 자체도 감사 로그에 남는다. 다만 `actor='system'` 이라 다시 후보에 오르지
않는다 — 되돌리기의 되돌리기 루프가 생기지 않는다.

**새 테이블을 만들면 트리거가 저절로 붙지 않는다.** 017 이 만들 때 있던 표만
대상이었기 때문이다. 새 표를 더하는 마이그레이션은 `rebuildAuditTriggers(db)` 를
불러야 하고, `test/audit-coverage.test.js` 가 안 부른 것을 잡는다. 018·019 에서
실제로 걸렸다.

**전제:** `_audit_context` 가 단일 행으로 성립하는 근거는 better-sqlite3 가 동기이고
이 앱이 단일 프로세스·단일 커넥션이라는 점이다. 커넥션 풀이나 워커 스레드가 들어오면
깨진다 — 그때는 `AsyncLocalStorage` 로 바꿔야 한다.

## 반복 규칙 — 발생일 단위로 센다 (#278, #279, #280)

004 의 `recurring_rule_months` 는 월 단위 전제라 `daily` 규칙의 멱등성을 보장할 수
없다(한 달에 여러 번 발생한다). 013 이 `recurring_occurrences` 로 옮겼다.

**멱등성의 근거는 `UNIQUE(rule_id, occurred_on)` 이다.** 애플리케이션에서 "이미 있나
확인 후 삽입" 하면 확인과 삽입 사이에 경쟁이 생긴다. `INSERT OR IGNORE` 로 DB 가
판정하게 하고, 실제로 들어간 건에 대해서만 거래를 만든다.

`freq`/`interval` 기본값이 `monthly`/`1` 이라 기존 행은 그대로 월 반복으로 남는다 —
마이그레이션이 동작을 바꾸지 않는다.

**지정일이 그 달에 없으면 말일로 당긴다(A안, 2026-08-03 확정).** 월세·구독료는
카드사도 말일로 당겨 청구한다. 건너뛰면 사용자가 "왜 2월만 빠졌지" 를 겪는다.

## 카드 — 카드사 아래에 상품이 붙는다 (#274, #306)

실제 데이터의 `payment_methods` 는 **카드사 단위**다(하나카드·삼성카드 …). 개별
카드가 아니다. `payment_methods` 를 부수지 않고 `card_products` 를 옆에 붙였다 —
기존 거래가 `payment_method_id` 를 참조하고 있어 갈아엎으면 파급이 크다.

**`card_products.payment_method_id` 에 UNIQUE 를 걸지 않는다.** 같은 카드사 카드
두 장을 표현할 수 없으면 이 구조의 목적이 사라진다.

**기존 거래의 카드 상품은 추측하지 않는다.** 시기·금액·가맹점으로 역추정하면
그럴듯하지만, 틀렸을 때 전략 계산이 조용히 잘못된 답을 낸다. 전부 NULL 로 두고
사용자가 직접 지정한다. 아직 안 정한 거래 수는
`GET /api/card-products/unassigned-count` 가 알려준다.

**청구 주기 세 컬럼은 NULL 을 허용한다.** 사용자가 자기 카드의 결제일·마감일을 모를
수 있고, 모르는 것을 0 이나 1 로 채우면 계산이 틀린 답을 자신 있게 낸다.

**전월 실적은 달력 월이다 — 청구 이용기간과 다르다.** 두 값이 답하는 질문이 다르다.

| | 무엇을 정하나 | 기준 |
|---|---|---|
| 결제일별 **이용기간** | 이번 달에 얼마를 **청구**하나 | 결제일·마감일마다 다르다 |
| **전월실적 산정기간** | 혜택 **자격**을 채웠나 | **전월 1일 ~ 말일 (달력월)** |

처음에는 실적도 `statement_close_day` 기준 구간으로 잡았고 이 문서가 그렇게
적고 있었다. **틀렸다**(#398). 사용자가 실사용 중 제기해 조사한 결과 달력월이
맞았다. 근거는 관행 그 자체다 — 사람들이 결제일을 12·13·14·15일로 맞추는 이유가
실적이 달력월로 고정이라서 청구 이용기간을 거기 맞추려는 것이다. 실적이 결제일을
따라간다면 이 관행이 성립할 이유가 없다.

실거래로 잰 오차에서 **판정이 뒤집혔다.**

```
결제일 25일 카드, 2026-02 기준, 실적조건 400,000원
  마감일 기준 01-12 ~ 02-11  →  321,394원  "미달"    ← 틀림
  전월 달력월 01-01 ~ 01-31  →  403,054원  "충족"    ← 맞음
```

따라서 `cardThreshold.prevPeriodFor(asOf)` 는 **카드 정보를 받지 않는다.** 인자를
다시 추가하면 언젠가 누가 그걸 쓴다. `cardBilling.billingMonthFor` 는 **청구월**이라
결제일·마감일 기준이 맞다 — **두 함수를 같은 규칙으로 통일하려 들면 안 된다.**
`test/cardThreshold.test.js` 의 `describe('E. ...')` 가 위 금액을 회귀 테스트로
고정하고 있다.

`card_benefits.rate` 는 0 도 100 도 유효하다. 0 은 "이 카테고리에는 혜택 없음" 을
명시적으로 적어 두는 쓰임이 있다 — 안 적은 것과 없다고 적은 것은 다르다.
