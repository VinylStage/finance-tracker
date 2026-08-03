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
| debt_interest_log | 부채 이자 로그 기록 | id, debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after, memo, created_at |
| app_settings | 애플리케이션 설정 정보 저장 | key, value |
| savings_products | 저축 상품 정보 저장 | id, name, monthly_contribution, start_date, maturity_date, expected_payout, category_id, status |

## 테이블 관계

- `transactions.category_id` → `categories.id` (1:N)
- `transactions.payment_method_id` → `payment_methods.id` (1:N)
- `transactions.installment_id` → `installments.id` (1:N)
- `installments.payment_method_id` → `payment_methods.id` (1:N)
- `revolving_history.payment_method_id` → `payment_methods.id` (1:N)
- `debt_interest_log.debt_id` → `debts.id` (1:N)
- `debt_rate_history.debt_id` → `debts.id` (1:N)
- `savings_products.category_id` → `categories.id` (1:N)

## 파생 거래 (#268, #269)

`transactions` 의 일부 행은 사용자가 입력한 것이 아니라 할부·리볼빙·부채이자
원본에서 계산돼 만들어진다. 그 행을 식별하는 것이 `origin` 계열 컬럼이다.

| 컬럼 | 의미 |
|---|---|
| `origin` | `manual` / `installment` / `revolving` / `debt_interest` |
| `origin_ref_table` | 원본 테이블명 (`installments`, `revolving_history`, `debt_interest_log`) |
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
| 부채 이자 | `해당없음` | 이자가 부채 잔액에 자본화된다. 실제 상환은 사용자가 따로 입력한다 |

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

## 테이블 분리 이유 요약

- `transactions`: 일반적인 거래 내역을 저장
- `installments`: 분할 결제 정보를 독립적으로 관리하여 결제 시스템과 분할 상환 로직을 분리
- `revolving_history`: 신용카드 회계 기록을 저장하며, 이는 단순 거래 내역이 아닌 특정 기간의 회계 정보를 필요로 함
