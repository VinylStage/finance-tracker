# 데이터 모델 문서

## 테이블 목록

| 테이블 이름 | 목적 | 주요 컬럼 |
|-------------|------|-----------|
| payment_methods | 결제수단 정보 저장 | id, name, type, is_active, created_at |
| categories | 지출/수입 카테고리 저장 | id, major_type, name, monthly_budget, is_active |
| transactions | 일시불 및 일반적인 거래 내역 저장 | id, date, category_id, amount, payment_method_id, payment_style, merchant, memo, installment_id, created_at |
| installments | 분할 결제 정보 저장 | id, purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month, status |
| revolving_history | 신용카드 회계 기록 저장 | id, month, carried_balance, new_charge, paid_amount, interest, next_carried_balance, payment_method_id |
| debts | 부채 정보 저장 | id, name, balance, annual_rate, memo, updated_at |
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
- `savings_products.category_id` → `categories.id` (1:N)

## 테이블 분리 이유 요약

- `transactions`: 일반적인 거래 내역을 저장
- `installments`: 분할 결제 정보를 독립적으로 관리하여 결제 시스템과 분할 상환 로직을 분리
- `revolving_history`: 신용카드 회계 기록을 저장하며, 이는 단순 거래 내역이 아닌 특정 기간의 회계 정보를 필요로 함
