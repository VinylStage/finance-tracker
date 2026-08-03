# API 문서

## cashflow.js

### GET /api/cashflow
- **Description**: Retrieve cash flow data with optional granularity (daily, weekly, monthly, yearly)
- **Query Parameters**:
  - `granularity` (optional): String. Values: 'daily', 'weekly', 'monthly' (default), 'yearly'
- **Response Schema**:
  ```json
  {
    "granularity": "string",
    "data": [
      {
        "period": "string",
        "income": "number",
        "expense": "number",
        "balance": "number"
      }
    ],
    "comparison": {
      "current": {
        "period": "string",
        "income": "number",
        "expense": "number",
        "balance": "number"
      },
      "previous": {
        "period": "string",
        "income": "number",
        "expense": "number",
        "balance": "number"
      }
    }
  }
  ```
- **Error Cases**:
  - 500: Internal server error (if query fails)

## categories.js

### GET /api/categories
- **Description**: Retrieve all active categories
- **Response Schema**:
  ```json
  [
    {
      "id": "number",
      "major_type": "string",
      "name": "string",
      "monthly_budget": "number",
      "is_active": "number"
    }
  ]
  ```

### POST /api/categories
- **Description**: Create a new category
- **Request Body**:
  ```json
  {
    "major_type": "string",
    "name": "string",
    "monthly_budget": "number"
  }
  ```
- **Response Schema**:
  ```json
  {
    "id": "number"
  }
  ```
- **Error Cases**:
  - 500: Internal server error (if insert fails)

### PUT /api/categories/:id
- **Description**: Update an existing category
- **Request Body**:
  ```json
  {
    "major_type": "string",
    "name": "string",
    "monthly_budget": "number",
    "is_active": "number"
  }
  ```
- **Response Schema**:
  ```json
  {
    "ok": "boolean"
  }
  ```

### DELETE /api/categories/:id
- **Description**: Deactivate a category by ID
- **Response Schema**:
  ```json
  {
    "ok": "boolean"
  }
  ```

## settings.js

### GET /api/settings
- **Description**: Retrieve application settings
- **Response Schema**:
  ```json
  {
    "initial_balance": "number",
    "monthly_income": "number"
  }
  ```

### PUT /api/settings
- **Description**: Update application settings
- **Request Body**:
  ```json
  {
    "initial_balance": "number",
    "monthly_income": "number"
  }
  ```
- **Response Schema**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **Error Cases**:
  - 500: Internal server error (if update fails)

## paymentMethods.js

### GET /api/payment-methods
- **Description**: Retrieve all active payment methods
- **Response Schema**:
  ```json
  [
    {
      "id": "number",
      "name": "string",
      "type": "string",
      "is_active": "number"
    }
  ]
  ```

### POST /api/payment-methods
- **Description**: Create a new payment method
- **Request Body**:
  ```json
  {
    "name": "string",
    "type": "string"
  }
  ```
- **Response Schema**:
  ```json
  {
    "id": "number"
  }
  ```
- **Error Cases**:
  - 500: Internal server error (if insert fails)

### PUT /api/payment-methods/:id
- **Description**: Update an existing payment method
- **Request Body**:
  ```json
  {
    "name": "string",
    "type": "string",
    "is_active": "number"
  }
  ```
- **Response Schema**:
  ```json
  {
    "ok": "boolean"
  }
  ```

### DELETE /api/payment-methods/:id
- **Description**: Deactivate a payment method by ID
- **Response Schema**:
  ```json
  {
    "ok": "boolean"
  }
  ```
## export.js

### GET /api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD

- **쿼리 파라미터:**
  - `from` (선택): 시작 날짜 (YYYY-MM-DD 형식)
  - `to` (선택): 종료 날짜 (YYYY-MM-DD 형식)

- **응답 스키마:**
  - CSV 형식의 거래내역 데이터

- **에러 케이스:**
  - 500: 데이터베이스 오류

### GET /api/export/json?from=YYYY-MM-DD&to=YYYY-MM-DD

- **쿼리 파라미터:**
  - `from` (선택): 시작 날짜 (YYYY-MM-DD 형식)
  - `to` (선택): 종료 날짜 (YYYY-MM-DD 형식)

- **응답 스키마:**
  ```json
  {
    "schema_version": "number",
    "exported_at": "string",
    "range": {
      "from": "string | null",
      "to": "string | null"
    },
    "transactions": [
      {
        "id": "number",
        "date": "string",
        "category_id": "number",
        "amount": "number",
        "payment_method_id": "number",
        "memo": "string",
        "payment_style": "string",
        "merchant": "string"
      }
    ],
    "categories": [
      {
        "id": "number",
        "major_type": "string",
        "name": "string",
        "monthly_budget": "number",
        "is_active": "number"
      }
    ],
    "payment_methods": [
      {
        "id": "number",
        "name": "string",
        "type": "string",
        "is_active": "number"
      }
    ],
    "installments": [
      {
        "id": "number",
        "transaction_id": "number",
        "amount": "number",
        "total_installments": "number",
        "current_installment": "number",
        "payment_date": "string"
      }
    ],
    "revolving_history": [
      {
        "id": "number",
        "debt_id": "number",
        "date": "string",
        "amount": "number",
        "balance": "number"
      }
    ],
    "debts": [
      {
        "id": "number",
        "name": "string",
        "amount": "number",
        "interest_rate": "number",
        "start_date": "string",
        "end_date": "string",
        "is_active": "number"
      }
    ],
    "debt_interest_log": [
      {
        "id": "number",
        "debt_id": "number",
        "date": "string",
        "amount": "number"
      }
    ],
    "savings_products": [
      {
        "id": "number",
        "name": "string",
        "interest_rate": "number",
        "start_date": "string",
        "end_date": "string",
        "is_active": "number"
      }
    ]
  }
  ```

- **에러 케이스:**
  - 500: 데이터베이스 오류

### GET /api/export?format=csv|json&from=&to=

- **쿼리 파라미터:**
  - `format` (선택): `'csv'` 또는 `'json'`. 기본값은 `'json'`
  - `from` (선택): 시작 날짜 (YYYY-MM-DD 형식)
  - `to` (선택): 종료 날짜 (YYYY-MM-DD 형식)

- **응답 스키마:**
  - CSV 또는 JSON 형식의 데이터

- **에러 케이스:**
  - 500: 데이터베이스 오류
## installments.js

### GET /api/installments
- **요청 파라미터**:
  - `status` (query string, optional): 상태 필터링 (예: '진행중')
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "id": "integer",
        "purchase_date": "string",
        "merchant": "string",
        "total_amount": "number",
        "months": "integer",
        "monthly_amount": "number",
        "fee_per_month": "number",
        "payment_method_id": "integer",
        "start_billing_month": "string",
        "status": "string",
        "payment_method_name": "string",
        "remaining_months": "integer",
        "billed_months": "integer"
      }
    ],
    "this_month_total": "number"
  }
  ```
- **에러 케이스**:
  - 500: 서버 내부 오류

### POST /api/installments
- **요청 파라미터**:
  - `purchase_date` (body, required): 구매일자
  - `merchant` (body, required): 가맹점명
  - `total_amount` (body, required): 총액
  - `months` (body, required): 할부 개월수
  - `monthly_amount` (body, required): 월할부금액
  - `fee_per_month` (body, optional, default: 0): 월 수수료
  - `payment_method_id` (body, optional): 결제수단 ID
  - `start_billing_month` (body, required): 시작 청구월
- **응답 스키마**:
  ```json
  {
    "id": "integer",
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 400: 필수 파라미터 누락 또는 months가 2개 미만
  - 500: 서버 내부 오류

### PUT /api/installments/:id
- **요청 파라미터**:
  - `id` (path parameter, required): 할부 ID
  - `purchase_date` (body, optional): 구매일자
  - `merchant` (body, optional): 가맹점명
  - `total_amount` (body, optional): 총액
  - `months` (body, optional): 할부 개월수
  - `monthly_amount` (body, optional): 월할부금액
  - `fee_per_month` (body, optional): 월 수수료
  - `payment_method_id` (body, optional): 결제수단 ID
  - `start_billing_month` (body, optional): 시작 청구월
  - `status` (body, optional): 상태
- **응답 스키마**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 404: 할부 정보 없음
  - 500: 서버 내부 오류

### DELETE /api/installments/:id
- **요청 파라미터**:
  - `id` (path parameter, required): 할부 ID
- **응답 스키마**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 500: 서버 내부 오류

## revolving.js

### GET /api/revolving
- **요청 파라미터**:
  - `payment_method_id` (query string, optional): 결제수단 ID
  - `from` (query string, optional): 시작 월
  - `to` (query string, optional): 종료 월
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "id": "integer",
        "month": "string",
        "payment_method_id": "integer",
        "carried_balance": "number",
        "new_charge": "number",
        "paid_amount": "number",
        "interest": "number",
        "next_carried_balance": "number",
        "payment_method_name": "string"
      }
    ],
    "current_carried_balance": "number"
  }
  ```
- **에러 케이스**:
  - 500: 서버 내부 오류

### POST /api/revolving
- **요청 파라미터**:
  - `month` (body, required): 월
  - `payment_method_id` (body, required): 결제수단 ID
  - `carried_balance` (body, optional, default: 0): 이월잔액
  - `new_charge` (body, optional, default: 0): 신규충전
  - `paid_amount` (body, required): 지불금액
  - `interest` (body, optional, default: 0): 이자
- **응답 스키마**:
  ```json
  {
    "id": "integer",
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 400: 필수 파라미터 누락
  - 409: 해당 월/카드 조합이 이미 등록되어 있음
  - 500: 서버 내부 오류

### PUT /api/revolving/:id
- **요청 파라미터**:
  - `id` (path parameter, required): 리볼빙 ID
  - `month` (body, optional): 월
  - `payment_method_id` (body, optional): 결제수단 ID
  - `carried_balance` (body, optional): 이월잔액
  - `new_charge` (body, optional): 신규충전
  - `paid_amount` (body, optional): 지불금액
  - `interest` (body, optional): 이자
- **응답 스키마**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 404: 리볼빙 정보 없음
  - 409: 해당 월/카드 조합이 이미 등록되어 있음
  - 500: 서버 내부 오류

### DELETE /api/revolving/:id
- **요청 파라미터**:
  - `id` (path parameter, required): 리볼빙 ID
- **응답 스키마**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 500: 서버 내부 오류
## debts.js

### GET /api/debts
- **요청 파라미터**: 없음
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "id": 1,
        "name": "string",
        "balance": number,
        "annual_rate": number,
        "type": "string",
        "memo": "string | null",
        "updated_at": "string",
        "monthly_interest": number
      }
    ],
    "total_balance": number,
    "total_monthly_interest": number
  }
  ```
- **에러 케이스**:
  - 500: DB 오류

### POST /api/debts
- **요청 파라미터**:
  ```json
  {
    "name": "string",
    "balance": number,
    "annual_rate": number,
    "type": "string",
    "memo": "string | null"
  }
  ```
- **응답 스키마**:
  ```json
  {
    "id": number,
    "ok": true
  }
  ```
- **에러 케이스**:
  - 400: name 또는 balance 누락
  - 500: DB 오류

### PUT /api/debts/:id
- **요청 파라미터**:
  ```json
  {
    "name": "string",
    "balance": number,
    "annual_rate": number,
    "type": "string",
    "memo": "string | null"
  }
  ```
- **응답 스키마**:
  ```json
  {
    "ok": true
  }
  ```
- **에러 케이스**:
  - 404: debt 없음
  - 500: DB 오류

### DELETE /api/debts/:id
- **요청 파라미터**: 없음
- **응답 스키마**:
  ```json
  {
    "ok": true
  }
  ```
- **에러 케이스**: 없음

### POST /api/debts/:id/interest
- **요청 파라미터**:
  ```json
  {
    "rate": number,
    "interest_amount": number,
    "log_date": "string",
    "memo": "string | null"
  }
  ```
- **응답 스키마**:
  ```json
  {
    "ok": true,
    "balance_after": number
  }
  ```
- **에러 케이스**:
  - 404: debt 없음
  - 400: rate, interest_amount, log_date 누락
  - 500: DB 오류

### GET /api/debts/:id/interest-log
- **요청 파라미터**: 없음
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "id": 1,
        "debt_id": number,
        "log_date": "string",
        "rate_at_time": number,
        "interest_amount": number,
        "balance_before": number,
        "balance_after": number,
        "memo": "string | null"
      }
    ]
  }
  ```
- **에러 케이스**:
  - 500: DB 오류
## cardPolicies.js

카드사 할부 정책 마스터(#266). 저장은 개월수 하나당 한 행이고, 화면은 구간으로
입력·표시한다(#271).

`effective_from` / `effective_to` 로 시점별 정책을 남긴다. 덮어쓰기로 관리하면
과거 할부의 이자 계산이 소급해서 바뀐다.

### GET /api/card-policies
- **요청 파라미터**:
  - `payment_method_id` (query, optional): 결제수단으로 거르기
  - `months` (query, optional): 개월수로 거르기
  - `on` (query, optional): 이 날짜에 유효한 것만
- **응답 스키마**: `{ "data": [ card_installment_policies 행 + payment_method_name ] }`

### GET /api/card-policies/effective
특정 시점에 유효한 정책 1건. 이자 계산이 쓰는 조회다.

- **요청 파라미터**: `payment_method_id`, `months`, `on` (모두 required)
- **응답 스키마**: `{ "data": 정책 행 | null }`
- **에러 케이스**: 400 — 셋 중 하나라도 빠짐

### POST /api/card-policies/range
개월수 구간을 개월수별 행으로 펼쳐 **한 트랜잭션에** 등록한다.

- **요청 파라미터**:
  - `payment_method_id` (body, required)
  - `from_month` / `to_month` (body, required): 개월수 구간. 2 이상 60 이하
  - `policy_type` (body, required): `무이자` / `부분무이자` / `유이자`
  - `annual_rate` (body, optional, default 0)
  - `free_months` (body, optional, default 0)
  - `effective_from` (body, required) / `effective_to` (body, optional)
  - `memo` (body, optional)
- **응답 스키마**: `{ "ok": true, "created": "number" }`
- **비고**: 펼치기를 서버가 하는 이유는 원자성이다. 화면이 개월수마다 POST 하면
  중간에 겹침으로 막혔을 때 앞부분만 저장된 상태가 남는다. 겹침은 **전부 먼저
  확인하고** 하나라도 걸리면 아무것도 넣지 않는다.
- **에러 케이스**:
  - 400: 필수값 누락 / 구간이 뒤집힘 / 정책 종류와 값이 어긋남
  - 409: 겹치는 개월수가 있음. 어느 개월인지 문구에 담는다

### POST /api/card-policies
개월수 1건 등록. 구간 입력 화면은 `/range` 를 쓴다.

- **요청 파라미터**: `payment_method_id`, `months`, `policy_type`, `effective_from` (required),
  `annual_rate`, `free_months`, `effective_to`, `memo` (optional)
- **응답 스키마**: `{ "id": "integer", "ok": true }`
- **에러 케이스**: 400 (검증 실패), 409 (기간 겹침)

### PUT /api/card-policies/:id
- **요청 파라미터**: POST 와 같음 (부분 갱신)
- **응답 스키마**: `{ "ok": true }`
- **에러 케이스**: 404, 400, 409

### DELETE /api/card-policies/range
목록에 구간으로 보이는 것을 구간째 지운다.

- **요청 파라미터**: `payment_method_id`, `from_month`, `to_month`, `effective_from` (모두 query, required)
- **응답 스키마**: `{ "ok": true, "deleted": "number" }`
- **비고**: `effective_from` 까지 일치해야 지운다. 같은 개월수라도 적용 기간이
  다르면 별개 정책이라 함께 사라지면 안 된다.
- **에러 케이스**: 400 — 구간을 특정할 수 없음

### DELETE /api/card-policies/:id
- **응답 스키마**: `{ "ok": true }`
- **에러 케이스**: 404

## savings.js

### GET /api/savings
- **요청 파라미터**: 없음
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "id": "integer",
        "name": "string",
        "monthly_contribution": "number",
        "start_date": "string (date)",
        "maturity_date": "string (date) | null",
        "expected_payout": "number | null",
        "category_id": "integer | null",
        "status": "string",
        "category_name": "string | null"
      }
    ]
  }
  ```
- **에러 케이스**:
  - 500: DB 오류 시

### POST /api/savings
- **요청 파라미터**:
  ```json
  {
    "name": "string",
    "monthly_contribution": "number",
    "start_date": "string (date)",
    "maturity_date": "string (date) | null",
    "expected_payout": "number | null",
    "category_id": "integer | null"
  }
  ```
- **응답 스키마**:
  ```json
  {
    "id": "integer",
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 400: name, monthly_contribution, start_date 중 하나 이상 누락
  - 500: DB 오류 시

### PUT /api/savings/:id
- **요청 파라미터**:
  ```json
  {
    "name": "string",
    "monthly_contribution": "number",
    "start_date": "string (date)",
    "maturity_date": "string (date) | null",
    "expected_payout": "number | null",
    "category_id": "integer | null",
    "status": "string"
  }
  ```
- **응답 스키마**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **에러 케이스**:
  - 404: 해당 ID의 적금 상품 없음
  - 500: DB 오류 시

### DELETE /api/savings/:id
- **요청 파라미터**: 없음
- **응답 스키마**:
  ```json
  {
    "ok": "boolean"
  }
  ```
- **에러 케이스**: 없음

### POST /api/savings/:id/mature
- **요청 파라미터**:
  ```json
  {
    "settle_date": "string (date) | null"
  }
  ```
- **응답 스키마**:
  ```json
  {
    "ok": "boolean",
    "principal": "number",
    "interest": "number",
    "payout": "number"
  }
  ```
- **에러 케이스**:
  - 404: 해당 ID의 적금 상품 없음
  - 400: 이미 만기 처리된 상품 또는 데이터 누락
  - 500: DB 오류 시

## transactions.js

### GET /

- **요청 파라미터**
  - `limit` (선택, 기본값: 100): 반환할 항목 수
  - `offset` (선택, 기본값: 0): 오프셋
  - `from` (선택): 시작 날짜 (YYYY-MM-DD 형식)
  - `to` (선택): 종료 날짜 (YYYY-MM-DD 형식)
  - `category_id` (선택): 카테고리 ID

- **응답 스키마**
  ```json
  {
    "data": [
      {
        "id": integer,
        "date": string,
        "category_id": integer,
        "amount": number,
        "payment_method_id": integer,
        "payment_style": string,
        "merchant": string,
        "memo": string,
        "category_name": string,
        "major_type": string,
        "payment_method_name": string
      }
    ],
    "total": integer
  }
  ```

- **에러 케이스**
  - 500: 서버 내부 에러

### GET /period-comparison

- **요청 파라미터**
  - `period` (선택, 기본값: monthly): 비교 기간 유형 (daily|weekly|monthly|yearly)
  - `date` (선택): 비교 기준 날짜 (YYYY-MM-DD 형식)

- **응답 스키마**
  ```json
  {
    "period": string,
    "anchorDate": string,
    "currentLabel": string,
    "previousLabel": string,
    "data": [
      {
        "label": string,
        "currentDate": string,
        "previousDate": string,
        "currentIncome": number,
        "currentExpense": number,
        "previousIncome": number,
        "previousExpense": number
      }
    ],
    "summary": {
      "currentIncome": number,
      "previousIncome": number,
      "incomeDiff": number,
      "incomeDiffPercent": number,
      "currentExpense": number,
      "previousExpense": number,
      "expenseDiff": number,
      "expenseDiffPercent": number,
      "currentNet": number,
      "previousNet": number,
      "netDiff": number,
      "netDiffPercent": number
    }
  }
  ```

- **에러 케이스**
  - 400: 유효하지 않은 날짜 또는 기간 형식
  - 500: 서버 내부 에러

### GET /:id

- **요청 파라미터**
  - `id` (필수): 트랜잭션 ID

- **응답 스키마**
  ```json
  {
    "id": integer,
    "date": string,
    "category_id": integer,
    "amount": number,
    "payment_method_id": integer,
    "payment_style": string,
    "merchant": string,
    "memo": string,
    "category_name": string,
    "major_type": string,
    "payment_method_name": string
  }
  ```

- **에러 케이스**
  - 404: 트랜잭션을 찾을 수 없음
  - 500: 서버 내부 에러

### POST /

- **요청 파라미터**
  - `date` (필수): 거래 날짜 (YYYY-MM-DD 형식)
  - `category_id` (필수): 카테고리 ID
  - `amount` (필수): 금액
  - `payment_method_id` (선택): 결제 수단 ID
  - `payment_style` (선택, 기본값: 일시불): 결제 방식
  - `merchant` (선택): 가맹점
  - `memo` (선택): 메모

- **응답 스키마**
  ```json
  {
    "id": integer
  }
  ```

- **에러 케이스**
  - 400: 필수 필드 누락
  - 500: 서버 내부 에러

### PUT /:id

- **요청 파라미터**
  - `id` (필수): 트랜잭션 ID
  - `date`: 거래 날짜 (YYYY-MM-DD 형식)
  - `category_id`: 카테고리 ID
  - `amount`: 금액
  - `payment_method_id`: 결제 수단 ID
  - `payment_style`: 결제 방식
  - `merchant`: 가맹점
  - `memo`: 메모

- **응답 스키마**
  ```json
  {
    "ok": boolean
  }
  ```

- **에러 케이스**
  - 500: 서버 내부 에러


### DELETE /:id
- **Method**: DELETE
- **Path**: `/api/transactions/:id`
- **요청 파라미터**: 
  - `id` (path parameter): 삭제할 거래의 ID
- **응답 스키마**: 
  ```json
  { "ok": true }
  ```
- **에러 케이스**:
  - 500: DB 오류

### DELETE /
- **Method**: DELETE
- **Path**: `/api/transactions`
- **설명**: 일괄 삭제. 선택 항목 삭제(`ids`) 또는 전체 초기화(`all: true`) 중 하나를 요청 본문으로 전달
- **요청 본문** (다음 중 하나):
  ```json
  { "ids": [1, 2, 3] }
  ```
  ```json
  { "all": true }
  ```
- **응답 스키마**:
  ```json
  { "ok": true, "deleted": integer }
  ```
- **에러 케이스**:
  - 400: `ids`(비어있지 않은 배열) 또는 `all: true` 중 하나가 필요함 / `ids`에 유효한 정수가 없음
  - 500: DB 오류

### GET /summary/dashboard
- **Method**: GET
- **Path**: `/api/transactions/summary/dashboard`
- **요청 파라미터**: 없음
- **응답 스키마**:
  ```json
  {
    "thisMonth": "YYYY-MM",
    "income": number,
    "expense": number,
    "available": number,
    "installmentsDue": number,
    "revolvingPaid": number,
    "budgets": [
      {
        "name": string,
        "major_type": string,
        "monthly_budget": number,
        "spent": number
      }
    ],
    "categoryBreakdown": [
      {
        "category": string,
        "total": number,
        "budget": number
      }
    ],
    "dailyTrend": [
      {
        "date": "YYYY-MM-DD",
        "income": number,
        "expense": number
      }
    ],
    "weeklyTrend": [
      {
        "week": "YYYY-MM-DD",
        "income": number,
        "expense": number
      }
    ],
    "monthlyTrend": [
      {
        "month": "YYYY-MM",
        "income": number,
        "expense": number
      }
    ],
    "topMerchants": [
      {
        "merchant": string,
        "total": number
      }
    ]
  }
  ```
- **에러 케이스**:
  - 500: DB 오류

### GET /summary/category-breakdown
- **Method**: GET
- **Path**: `/api/transactions/summary/category-breakdown`
- **요청 파라미터**:
  - `from`: 시작 날짜 (YYYY-MM-DD)
  - `to`: 종료 날짜 (YYYY-MM-DD)
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "category": string,
        "total": number
      }
    ]
  }
  ```
- **에러 케이스**:
  - 400: `from`, `to` 파라미터 없음
  - 500: DB 오류

### GET /suggest/category
- **Method**: GET
- **Path**: `/api/transactions/suggest/category`
- **요청 파라미터**:
  - `merchant`: 가맹점명 (query parameter)
- **응답 스키마**:
  ```json
  {
    "category_id": number | null,
    "confidence": "완전일치" | "부분일치" | "없음"
  }
  ```
- **에러 케이스**: 없음

### GET /suggest/merchants
- **Method**: GET
- **Path**: `/api/transactions/suggest/merchants`
- **요청 파라미터**:
  - `limit`: 최대 반환 개수 (기본값: 10)
- **응답 스키마**:
  ```json
  {
    "data": [
      string
    ]
  }
  ```
- **에러 케이스**: 없음
