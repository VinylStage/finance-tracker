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
    "ok": "boolean",
    "derived": { "created": "number" }
  }
  ```
- **비고**: 등록과 동시에 회차별 파생 거래가 만들어진다(#269). 지울 것이 없는
  신규 생성이므로 프리뷰를 요구하지 않는다. 몇 건이 생겼는지는 `derived.created` 로 알린다.
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
  - `paid_off_on` (body, optional): 조기 완납일 `YYYY-MM-DD`
  - `status` (body, optional): 상태
  - `preview_token` (body, conditional): 회차에 영향을 주는 값을 고칠 때 **필수**
- **응답 스키마**:
  ```json
  {
    "ok": "boolean",
    "derived": { "deleted": "number", "created": "number" }
  }
  ```
- **비고**: 회차에 영향을 주는 필드(`total_amount`, `months`, `start_billing_month`,
  `payment_method_id`, `purchase_date`, `paid_off_on`, `fee_per_month`)를 고치면
  파생 거래가 전부 지워지고 다시 만들어진다. 그래서 그 경우에만 프리뷰 확인을
  요구한다(ADR 0008). 메모·상태처럼 회차와 무관한 수정은 토큰 없이 통과한다.
- **에러 케이스**:
  - 404: 할부 정보 없음
  - 409: 프리뷰 이후 원본이 바뀜 (`preview_stale: true`) — 다시 미리보고 저장해야 한다
  - 428: 프리뷰 없이 회차 변경 시도 (`preview_required: true`)
  - 500: 서버 내부 오류

### GET /api/installments/duplicates?days=14
할부 전환(B안)으로 생긴 **중복 의심 거래**. **읽기 전용 — DB 를 바꾸지 않는다.**

할부의 정본은 `installments` 행 하나이고 거래내역에는 청구 회차만 파생 거래로
나타난다(#269 B안). 그 전에 할부 구매를 직접 거래로 넣어 뒀으면 그게 중복이 된다.

**자동으로 지우지 않는다.** 이 저장소는 실거래 2,212건 유실 사고가 있었다.

- **요청 파라미터**: `days` (query, optional, 기본 14, 0~365) — 구매일과 며칠까지 떨어진 것을 볼 것인가
- **응답 스키마**:
  ```json
  {
    "data": [
      {
        "transaction": { "id": "number", "date": "string", "merchant": "string",
                         "amount": "number", "payment_style": "string",
                         "category_name": "string", "memo": "string | null" },
        "installment_id": "number | null",
        "installment_merchant": "string | null",
        "confidence": "exact | likely | review",
        "days_apart": "number | null",
        "matched_on": "total | monthly | null"
      }
    ],
    "total_amount": "number",
    "day_window": "number"
  }
  ```
- **확신도**:
  - `exact` — 등록된 할부와 가맹점·금액·날짜가 모두 맞음
  - `likely` — 가맹점·날짜는 맞고 금액이 **월납입액** 쪽
  - `review` — 할부로 적혀 있는데 연결될 할부 등록이 없음
- **비고**: 가맹점명을 정규화해 비교한다 — 실데이터에 같은 가게가 `예스이십사 주식회사`
  · `예스이십사(주)` · `예스이십사` 로 들어 있다. 파생 거래는 계산 결과라 후보가 아니다.
  "중복 아님" 으로 판단한 거래는 목록에서 빠진다.

### POST /api/installments/duplicates/preview
지울 대상을 확인한다. **DB 를 바꾸지 않는다.**

- **요청 파라미터**: `ids` (body, 거래 id 배열)
- **응답 스키마**:
  ```json
  {
    "data": {
      "rows": [{ "id": "number", "date": "string", "merchant": "string", "amount": "number" }],
      "locked": [ "파생 거래라 지울 수 없는 행" ],
      "missing": [ "없는 id" ],
      "total": "number",
      "fingerprint": "string | null"
    }
  }
  ```

### POST /api/installments/duplicates/resolve
사용자가 고른 것만 처리한다.

- **요청 파라미터**:
  - `delete_ids` (body, optional): 지울 거래. **`preview_token` 필수**
  - `keep_ids` (body, optional): 중복이 아니라고 판단한 거래. 다음부터 목록에서 빠진다
  - `preview_token` (body, `delete_ids` 가 있으면 required): 프리뷰의 `fingerprint`
- **응답 스키마**: `{ "ok": true, "deleted": "number", "kept": "number" }`
- **비고**: 지우는 것만이 판단이 아니다. 둘 다 남겨 두기로 했는데 목록이 계속 같은
  행을 보여주면 사용자는 결국 목록 자체를 무시하게 되고, 그러면 진짜 중복도 놓친다.
- **에러 케이스**:
  - 400: 파생 거래가 섞여 있음
  - 409: 프리뷰 이후 대상이 바뀜 (`preview_stale`)
  - 428: 프리뷰 없이 지우기 시도 (`preview_required`)

### POST /api/installments/duplicates/restore
"중복 아님" 판단을 되돌린다. 다시 목록에 나온다.

- **요청 파라미터**: `ids` (body)
- **응답 스키마**: `{ "ok": true, "restored": "number" }`

### POST /api/installments/:id/derived/preview
회차 재생성 미리보기. **DB 를 바꾸지 않는다.**

- **요청 파라미터**:
  - `id` (path parameter, required): 할부 ID
  - 본문에 PUT 과 같은 모양의 변경안을 넣는다. 비우면 현재 값 기준으로 계산한다
- **응답 스키마**:
  ```json
  {
    "data": {
      "installment_id": "integer",
      "policy_applied": { "policy_type": "string", "annual_rate": "number", "free_from_sequence": "number" },
      "delete_count": "number",
      "create_count": "number",
      "before_total": "number",
      "after_total": "number",
      "delta": "number",
      "rows_before": [{ "billing_month": "string", "sequence": "number", "amount": "number" }],
      "rows_after":  [{ "billing_month": "string", "sequence": "number", "amount": "number" }],
      "changed_months": [{ "billing_month": "string", "before": "number", "after": "number", "is_past": "boolean" }],
      "past_affected": [{ "billing_month": "string", "before": "number", "after": "number", "is_past": true }],
      "reversible": "backup",
      "fingerprint": "string"
    }
  }
  ```
- **비고**: `fingerprint` 를 PUT 또는 apply 의 `preview_token` 으로 넘긴다.
  프리뷰 이후 원본이나 기존 파생 거래가 바뀌면 지문이 달라져 실행이 거부된다.
  `policy_applied` 가 `null` 이면 등록된 카드 정책이 없어 `fee_per_month` 를 회차
  수수료로 쓴 것이다.
- **에러 케이스**:
  - 404: 할부 정보 없음
  - 500: 서버 내부 오류

### POST /api/installments/:id/derived/apply
할부 값은 그대로 두고 회차만 다시 만든다. 카드 정책을 새로 입력한 뒤 쓴다.

- **요청 파라미터**:
  - `id` (path parameter, required): 할부 ID
  - `preview_token` (body, required): 프리뷰가 준 `fingerprint`
- **응답 스키마**:
  ```json
  { "ok": "boolean", "deleted": "number", "created": "number" }
  ```
- **에러 케이스**:
  - 404: 할부 정보 없음
  - 409 / 428: PUT 과 같음
  - 500: 서버 내부 오류

### GET /api/installments/:id/derived
이 할부가 만든 거래 목록.

- **응답 스키마**: `{ "data": [ transactions 행 ] }`

### DELETE /api/installments/:id
- **요청 파라미터**:
  - `id` (path parameter, required): 할부 ID
- **응답 스키마**:
  ```json
  {
    "ok": "boolean",
    "derived": { "deleted": "number" }
  }
  ```
- **비고**: 딸린 파생 거래를 같은 트랜잭션에서 지운다. 고아 행이 남지 않는다.
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
    "ok": "boolean",
    "derived": { "created": "number", "deleted": "number" }
  }
  ```
- **비고**: `interest` 가 0보다 크면 그 달의 수수료 거래 1건이 함께 만들어진다(#269).
  0이면 만들지 않는다. 한 건짜리 CRUD 라 프리뷰를 요구하지 않는다(ADR 0008 제외 항목).
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
    "ok": "boolean",
    "derived": { "created": "number", "deleted": "number" }
  }
  ```
- **비고**: 수수료가 바뀌면 파생 거래도 따라 갱신된다. 0으로 고치면 기존 거래가 사라진다.
- **에러 케이스**:
  - 404: 리볼빙 정보 없음
  - 409: 해당 월/카드 조합이 이미 등록되어 있음
  - 500: 서버 내부 오류

### GET /api/revolving/:id/derived
이 리볼빙 이력이 만든 수수료 거래.

- **응답 스키마**: `{ "data": [ transactions 행 ] }`

### DELETE /api/revolving/:id
- **요청 파라미터**:
  - `id` (path parameter, required): 리볼빙 ID
- **응답 스키마**:
  ```json
  {
    "ok": "boolean",
    "derived": { "deleted": "number" }
  }
  ```
- **비고**: 딸린 수수료 거래를 같은 트랜잭션에서 지운다.
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
  - `loan_type` (body, optional, default `general`): 이자 **계산 방식**. `general` | `credit_line`.
    `type`(용도 분류)과 다른 축이다 — 자세한 것은 `docs/DATA_MODEL.md`
  - `credit_limit` (body, `credit_line` 이면 required): 한도
  - `interest_basis` (body, optional): `daily` | `monthly`. 비우면 유형 기본값
  - `compounds` (body, optional): 이자의 원금 편입 여부. 비우면 유형 기본값
  - `interest_day` (body, optional): 이자 결제일
  - `rate_effective_from` (body, optional): 금리 이력 첫 행의 시작일. 비우면 오늘
  - `annual_rate` 는 **소수를 허용한다** (연 4.17%). 정수만 받던 검증이 실제 금리를
    거부하던 결함을 #285 에서 고쳤다
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
    "ok": true,
    "derived": { "deleted": "number" }
  }
  ```
- **비고**: 파생 이자 거래 → 이자 이력 → 부채 순으로 같은 트랜잭션에서 지운다.
  이력을 먼저 지우면 어떤 거래가 이 부채 것이었는지 찾을 수 없어 고아 행이 남는다.
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
    "balance_after": number,
    "derived": { "created": "number" }
  }
  ```
- **비고**: 이자 기록·잔액 갱신·이자 거래 생성이 한 트랜잭션이다(#269).
  `interest_amount` 가 0이면 거래를 만들지 않는다.
- **에러 케이스**:
  - 404: debt 없음
  - 400: rate, interest_amount, log_date 누락
  - 500: DB 오류

### GET /api/debts/:id/derived
이 부채의 이자 기록이 만든 거래 전부.

- **응답 스키마**: `{ "data": [ transactions 행 ] }`

### GET /api/debts/:id/repayments
부분상환 이력. 최근 상환이 위로 온다.

- **응답 스키마**: `{ "data": [ debt_repayments 행 ] }`

### POST /api/debts/:id/repayments
부분상환을 기록하고 잔액을 줄인다(#287).

`debts.balance` 를 직접 고치는 대신 여기를 거치게 하는 것이 요점이다. 직접 고치면
언제 얼마를 갚았는지가 남지 않아 과거 이자를 재계산할 수 없다.

- **요청 파라미터**:
  - `amount` (body, required): 총 상환액. 0보다 큰 정수
  - `repaid_on` (body, required): `YYYY-MM-DD`
  - `principal_portion` / `interest_portion` (body, optional): 배분을 직접 넣을 때.
    **둘을 더한 값이 `amount` 와 같아야 한다.** 비우면 전액이 원금분이 된다
  - `memo` (body, optional)
- **응답 스키마**:
  ```json
  {
    "ok": true, "id": "integer",
    "principal_portion": "number", "interest_portion": "number",
    "balance_before": "number", "balance_after": "number",
    "derived": { "created": "number" }
  }
  ```
- **비고**: 이력·잔액·거래가 한 트랜잭션이다. **원금분만 잔액에서 뺀다** — 이자분은
  이미 잔액에 편입돼 있던 이자를 갚는 것이라 전액을 빼면 이중으로 줄어든다.
  거래는 `origin='debt_repayment'` 로 만들어지고 거래내역에서 수정·삭제할 수 없다.
- **에러 케이스**: 404 (부채 없음), 400 (금액·날짜·배분 합)

### DELETE /api/debts/:id/repayments/:repaymentId
상환 기록을 지우고 **원금분만큼** 잔액을 되돌린다. 딸린 거래도 함께 지운다.

`balance_after` 로 되돌리지 않는다 — 그 사이에 다른 상환이나 이자가 있었으면 그것들까지 되감긴다.

- **응답 스키마**: `{ "ok": true, "restored": "number", "derived": { "deleted": "number" } }`
- **에러 케이스**: 404

### GET /api/debts/:id/interest-projection?from=&to=
마이너스통장의 기간 이자를 계산한다(#286). **읽기 전용 — DB 를 바꾸지 않는다.**

이자를 실제로 기록하는 것은 `POST /api/debts/:id/interest` 이고, 여기서는 "이 기간에
얼마가 붙는가" 만 보여준다. ADR 0008 이 읽기 전용 계산을 프리뷰 대상에서 제외한 것과
같은 성격이다.

구간을 **잔액 변동점과 금리 변경점 양쪽에서** 자른다. 변동금리 계좌에서 현재 금리로
소급 계산하면 그때 청구된 금액과 다르다.

- **요청 파라미터**: `from`, `to` (query, required, `YYYY-MM-DD`. `[from, to)` 반개구간)
- **응답 스키마**:
  ```json
  {
    "data": {
      "postings": [
        {
          "date": "string", "from": "string", "to": "string",
          "interest": "number",
          "balance_before": "number", "balance_after": "number",
          "over_limit": "boolean",
          "segments": [{ "from": "string", "to": "string", "days": "number",
                         "balance": "number", "annual_rate": "number", "interest": "number" }]
        }
      ],
      "total_interest": "number",
      "accrued_since_last_posting": "number",
      "capitalized": "number",
      "final_balance": "number"
    }
  }
  ```
- **비고**: `interest_day` 가 있으면 매월 그날이 회차 경계가 되고, 없으면 기간 전체가
  한 회차다. 복리(`compounds`)면 회차마다 이자가 잔액에 편입되어 다음 회차 이자가
  늘어난다. 한도를 넘어도 계산은 계속되고 `over_limit` 로만 알린다.
- **에러 케이스**:
  - 400: 기간 형식·순서 오류 / 그 구간의 금리 이력 없음 / 기간 계산을 지원하지 않는 유형
  - 404: 부채 없음

### GET /api/debts/:id/rates
금리 이력. 최근 적용분이 위로 온다.

- **응답 스키마**: `{ "data": [ debt_rate_history 행 ] }`

### POST /api/debts/:id/rates
금리를 바꾼다. 열려 있던 구간을 **전날로 닫고** 새 구간을 연다(#285).

변동금리(3개월 주기 등)를 통보받을 때마다 여기로 넣는다. `PUT /api/debts/:id` 는
금리를 건드리지 않는다 — 금리는 시점이 붙어야 의미가 있고, 덮어쓰면 과거 이자를
그때 금리로 재현할 수 없다.

- **요청 파라미터**:
  - `annual_rate` (body, required): 연이율. **소수 허용** (연 4.17% 등)
  - `effective_from` (body, required): `YYYY-MM-DD`. 이 금리가 적용되기 시작한 날
  - `memo` (body, optional): 예 `3개월 재산정`
- **응답 스키마**: `{ "ok": true, "id": "integer", "closed": "number" }` — `closed` 는 닫은 이전 구간 수
- **비고**: 같은 `effective_from` 으로 다시 넣으면 그 행을 고친다. 날짜 오타를
  바로잡을 때마다 이력이 늘면 읽을 수 없다. 미래 날짜로 넣으면 `debts.annual_rate`
  (현재 금리)는 바뀌지 않는다.
- **에러 케이스**: 404 (부채 없음), 400 (금리 범위·날짜 형식)

### GET /api/debts/:id/rate-on?date=YYYY-MM-DD
그 시점에 적용되던 연이율. 이력보다 앞선 날짜면 `null` 이다.

**`null` 을 0 으로 흘리지 않는다.** 금리를 모르는 구간을 0% 로 계산하면 이자가 조용히 사라진다.

- **응답 스키마**: `{ "data": "number | null" }`
- **에러 케이스**: 400 (날짜 형식)

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

**부분무이자는 뒤쪽이 면제된다.** 카드사 안내가 "6개월 부분무이자(4회차부터 면제)"
형태이고, 앞 회차일수록 할부잔액이 커서 수수료도 크기 때문에 비싼 구간을 고객이
부담한다. `free_from_sequence` 가 그 "면제 시작 회차" 다.

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
  - `free_from_sequence` (body, 부분무이자면 required): 수수료가 **면제되기 시작하는 회차**.
    카드사 안내의 "4회차부터 면제" 를 그대로 넣는다. 그 앞 회차는 고객 부담이다.
    2 이상이어야 하고 구간의 시작 개월수를 넘을 수 없다
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
  `annual_rate`, `free_from_sequence`, `effective_to`, `memo` (optional)
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
