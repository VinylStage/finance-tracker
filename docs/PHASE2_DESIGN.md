# Phase 2 Design — Installments · Revolving · Debts

> **Status:** Design complete — pending implementation  
> **Target:** Phase 2 (see ROADMAP.md)

---

## 1. 전제 조건 및 이중계산 방지 원칙

### 1.1 데이터 격리 원칙

| 결제 유형 | 기록 위치 | `transactions` 기록 여부 |
|---|---|---|
| 일시불 | `transactions` | ✅ 기록 |
| 할부 | `installments` | ❌ 기록 안 함 (구매 원건) |
| 할부 월납부 | 대시보드에서 집계만 | ❌ transactions에 없음 |
| 리볼빙 | `revolving_history` | ❌ 기록 안 함 |
| 리볼빙 실납부 | `revolving_history.paid_amount` | ❌ transactions에 없음 |

**이유:** `transactions` 테이블에 할부/리볼빙 납부를 중복 기록하면 지출이 이중으로 집계됨.

### 1.2 가용현금 계산 수식 (확정)

```
available_cash =
  SUM(income transactions this month)          -- 수입 거래 합계
  - SUM(expense transactions WHERE payment_style = '일시불' AND category.major_type != '수입')
  - SUM(installments.monthly_amount WHERE status = '진행중'
        AND start_billing_month <= 'YYYY-MM')   -- 이번달 청구 할부분
  - SUM(revolving_history.paid_amount WHERE month = 'YYYY-MM')  -- 리볼빙 실납부
```

**주의:** `transactions.payment_style IN ('할부','리볼빙')` 행은 대시보드 expense 집계에서 반드시 제외.  
현재 `transactions.js` 의 dashboard 쿼리가 이미 `payment_style NOT IN ('할부','리볼빙')` 필터를 포함하므로 유효.

### 1.3 할부 remaining_months 계산

```
remaining_months = months - (
  (strftime('%Y', 'now') - strftime('%Y', start_billing_month)) * 12
  + strftime('%m', 'now') - strftime('%m', start_billing_month)
  + 1
)
```

SQLite에서 계산식:
```sql
SELECT *,
  months - (
    (CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y', start_billing_month) AS INT)) * 12
    + CAST(strftime('%m','now') AS INT) - CAST(strftime('%m', start_billing_month) AS INT)
    + 1
  ) AS remaining_months
FROM installments
WHERE status = '진행중';
```

`remaining_months <= 0` 이면 자동 완료 처리 (status → '완료') 또는 UI에서 경고 표시.

---

## 2. Installments API 설계

### 2.1 파일 위치

```
src/routes/installments.js
```

server.js에 추가:
```js
app.use('/api/installments', require('./routes/installments'));
```

### 2.2 엔드포인트

#### `POST /api/installments` — 할부 등록

**Request Body:**
```json
{
  "purchase_date": "2026-07-01",
  "merchant": "삼성전자",
  "total_amount": 1500000,
  "months": 12,
  "monthly_amount": 125000,
  "fee_per_month": 0,
  "payment_method_id": 2,
  "start_billing_month": "2026-08"
}
```

**Validation:**
- `purchase_date`, `merchant`, `total_amount`, `months`, `monthly_amount`, `start_billing_month` 필수
- `months >= 2` (2개월 미만은 일시불로 처리)
- `monthly_amount * months <= total_amount * 1.5` (과도한 수수료 방지 경고)
- `start_billing_month` 형식: `YYYY-MM`

**Response 201:**
```json
{ "id": 5, "ok": true }
```

#### `GET /api/installments` — 할부 목록

**Query params:**
- `status` — `진행중` | `완료` | `(없으면 전체)`
- `month` — 특정 월 청구 필터 (예: `2026-07`, 생략 시 전체)

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "purchase_date": "2026-01-15",
      "merchant": "LG전자",
      "total_amount": 600000,
      "months": 6,
      "monthly_amount": 100000,
      "fee_per_month": 0,
      "payment_method_id": 1,
      "payment_method_name": "신한카드",
      "start_billing_month": "2026-02",
      "status": "진행중",
      "remaining_months": 2,
      "billed_months": 4
    }
  ],
  "this_month_total": 350000
}
```

**SQL:**
```sql
SELECT i.*,
  p.name AS payment_method_name,
  MAX(0,
    i.months - (
      (CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y', i.start_billing_month) AS INT)) * 12
      + CAST(strftime('%m','now') AS INT) - CAST(strftime('%m', i.start_billing_month) AS INT)
      + 1
    )
  ) AS remaining_months,
  MIN(i.months,
    (CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y', i.start_billing_month) AS INT)) * 12
    + CAST(strftime('%m','now') AS INT) - CAST(strftime('%m', i.start_billing_month) AS INT)
    + 1
  ) AS billed_months
FROM installments i
LEFT JOIN payment_methods p ON i.payment_method_id = p.id
WHERE (:status IS NULL OR i.status = :status)
ORDER BY i.status ASC, i.start_billing_month DESC;
```

#### `PUT /api/installments/:id` — 수정 (status 변경 포함)

**Request Body (partial update 허용):**
```json
{ "status": "완료" }
```

#### `DELETE /api/installments/:id` — 삭제

soft-delete 없이 hard delete (개인 앱이므로 단순 처리).

---

## 3. Revolving API 설계

### 3.1 파일 위치

```
src/routes/revolving.js
```

server.js에 추가:
```js
app.use('/api/revolving', require('./routes/revolving'));
```

### 3.2 개념

리볼빙은 매월 이월잔액을 관리하는 원장 방식:
```
next_carried_balance = carried_balance + new_charge - paid_amount + interest
```

### 3.3 엔드포인트

#### `POST /api/revolving` — 월 리볼빙 원장 기록

```json
{
  "month": "2026-07",
  "payment_method_id": 1,
  "carried_balance": 500000,
  "new_charge": 200000,
  "paid_amount": 300000,
  "interest": 8500
}
```

`next_carried_balance`는 서버에서 자동 계산:
```js
next_carried_balance = carried_balance + new_charge - paid_amount + interest
```

**Validation:**
- `month`, `payment_method_id`, `paid_amount` 필수
- (month, payment_method_id) UNIQUE 제약 → 중복 등록 방지 (DB 레벨)

> **DB 수정 필요:** `revolving_history`에 UNIQUE 인덱스 추가
> ```sql
> CREATE UNIQUE INDEX IF NOT EXISTS idx_revolving_month_pm 
>   ON revolving_history(month, payment_method_id);
> ```

#### `GET /api/revolving?payment_method_id=&from=&to=` — 원장 목록

```json
{
  "data": [
    {
      "id": 1,
      "month": "2026-07",
      "payment_method_name": "신한카드",
      "carried_balance": 500000,
      "new_charge": 200000,
      "paid_amount": 300000,
      "interest": 8500,
      "next_carried_balance": 408500
    }
  ],
  "current_carried_balance": 408500
}
```

#### `PUT /api/revolving/:id` — 수정

#### `DELETE /api/revolving/:id` — 삭제

---

## 4. Debts API 설계

### 4.1 파일 위치

```
src/routes/debts.js
```

server.js에 추가:
```js
app.use('/api/debts', require('./routes/debts'));
```

### 4.2 엔드포인트

#### `GET /api/debts` — 부채 목록

```json
{
  "data": [
    {
      "id": 1,
      "name": "전세자금대출",
      "balance": 50000000,
      "annual_rate": 3.5,
      "monthly_interest": 145833,
      "memo": "KB국민은행",
      "updated_at": "2026-07-01T00:00:00.000Z"
    }
  ],
  "total_balance": 50000000,
  "total_monthly_interest": 145833
}
```

`monthly_interest`는 `ROUND(balance * annual_rate / 100 / 12)`로 계산.

#### `POST /api/debts` — 부채 등록

```json
{
  "name": "전세자금대출",
  "balance": 50000000,
  "annual_rate": 3.5,
  "memo": "KB국민은행"
}
```

#### `PUT /api/debts/:id` — 잔액/금리 업데이트

매월 잔액이 바뀌면 수동으로 업데이트. `updated_at = CURRENT_TIMESTAMP` 자동 갱신.

#### `DELETE /api/debts/:id` — 삭제

---

## 5. 이중계산 방지 Validation

### 5.1 대시보드 쿼리 검증 체크리스트

| 항목 | 현재 코드 | 검증 |
|---|---|---|
| 할부 거래가 expense에 포함되는가 | `payment_style NOT IN ('할부','리볼빙')` | ✅ 방지됨 |
| 리볼빙 거래가 expense에 포함되는가 | 동일 필터 | ✅ 방지됨 |
| 할부 이번달 청구액 집계 | `installments WHERE status='진행중' AND start_billing_month <= thisMonth` | ✅ 있음 |
| 리볼빙 납부액 집계 | 현재 대시보드에 **없음** | ⚠️ Phase 2에서 추가 필요 |

### 5.2 대시보드 쿼리 수정 (transactions.js `/summary/dashboard`)

현재:
```js
available: income - expense - installmentsDue
```

Phase 2 이후:
```js
const revolvingPaid = db.prepare(`
  SELECT COALESCE(SUM(paid_amount), 0) AS total
  FROM revolving_history
  WHERE month = ?
`).get(thisMonth).total;

available: income - expense - installmentsDue - revolvingPaid
```

### 5.3 할부 등록 시 transaction 생성 금지

할부 구매 시 `transactions` 테이블에 절대 삽입하지 않음.
`installments` 테이블에만 기록.

트랜잭션 입력 form에서 payment_style = '할부' 선택 시:
- UI에서 `installments` 등록 페이지로 리다이렉트 안내
- 또는 form 내 모달로 할부 상세(개월수, 월납부액)를 추가 입력받아 installments로 저장

---

## 6. React 컴포넌트 구조

```
client/src/
├── pages/
│   ├── Installments.jsx      # 할부 관리 페이지
│   ├── Revolving.jsx         # 리볼빙 원장 페이지
│   └── Debts.jsx             # 부채 현황 페이지
├── components/
│   ├── installments/
│   │   ├── InstallmentForm.jsx      # 등록/수정 폼
│   │   └── InstallmentTable.jsx     # 목록 테이블
│   ├── revolving/
│   │   ├── RevolvingForm.jsx        # 월 원장 입력 폼
│   │   └── RevolvingTable.jsx       # 이력 테이블
│   └── debts/
│       ├── DebtForm.jsx             # 부채 등록/수정 폼
│       └── DebtSummary.jsx          # 총 부채/월이자 요약 카드
└── api/
    ├── installments.js      # fetch wrapper
    ├── revolving.js
    └── debts.js
```

---

## 7. UI 와이어프레임 (텍스트 기반)

### 7.1 Installments.jsx

```
┌─────────────────────────────────────────────────────┐
│  할부 관리                          [+ 할부 등록]   │
├─────────────────────────────────────────────────────┤
│  필터: [진행중 ▼]   이번달 청구 합계: 350,000원     │
├──────┬──────────┬────────┬──────┬───────┬──────────┤
│ 가맹점│ 총액     │ 월납부 │ 진행 │ 잔여  │ 상태     │
├──────┼──────────┼────────┼──────┼───────┼──────────┤
│ LG전자│ 600,000 │100,000 │ 4/6  │ 2개월 │ 진행중   │
│ 삼성  │1,500,000│125,000 │ 1/12 │11개월 │ 진행중   │
│ 나이키│ 300,000 │100,000 │ 3/3  │  -   │ [완료처리]│
└──────┴──────────┴────────┴──────┴───────┴──────────┘
```

### 7.2 Revolving.jsx

```
┌─────────────────────────────────────────────────────┐
│  리볼빙 원장                        [+ 이번달 기록] │
├─────────────────────────────────────────────────────┤
│  카드: [신한카드 ▼]   현재 이월잔액: 408,500원      │
├──────┬────────┬──────────┬──────────┬──────┬───────┤
│  월  │ 이월잔액│ 신규사용 │ 납부액   │ 이자 │ 차월이월│
├──────┼────────┼──────────┼──────────┼──────┼───────┤
│2026-07│500,000│ 200,000  │ 300,000  │ 8,500│408,500│
│2026-06│600,000│ 150,000  │ 250,000  │10,000│510,000│
└──────┴────────┴──────────┴──────────┴──────┴───────┘
```

### 7.3 Debts.jsx

```
┌─────────────────────────────────────────────────────┐
│  부채 현황                          [+ 부채 추가]   │
├────────────────────────────────────────────────────┤
│  총 부채: 50,000,000원   월이자 합계: 145,833원     │
├────────────────┬──────────┬───────┬────────────────┤
│  부채명        │  잔액    │ 연이율│  월이자 (참고) │
├────────────────┼──────────┼───────┼────────────────┤
│ 전세자금대출   │50,000,000│  3.5% │     145,833원  │
│                │          │       │          [수정]│
└────────────────┴──────────┴───────┴────────────────┘
```

---

## 8. 구현 순서 권장

1. `src/routes/installments.js` — API 구현 + server.js 등록
2. `src/routes/revolving.js` — API 구현 + server.js 등록  
3. `src/routes/debts.js` — API 구현 + server.js 등록
4. `db/init.js` — revolving UNIQUE 인덱스 추가
5. `transactions.js` dashboard 쿼리 — revolving paid_amount 반영
6. React: `api/` fetch wrappers 3개
7. React: 컴포넌트 구현 (Form → Table → Page 순)
8. React: `App.jsx` 라우팅에 3개 경로 추가

---

## 9. 주의사항

1. **할부 `remaining_months`가 음수 될 수 있음:** `MAX(0, ...)` 처리 필수
2. **리볼빙 이중등록:** `(month, payment_method_id)` UNIQUE 인덱스 없으면 중복 위험
3. **리볼빙 paid_amount 대시보드 미반영:** 현재 dashboard 쿼리에 revolving 집계 없음 → 반드시 추가
4. **할부 start_billing_month 비교:** 날짜가 아닌 `YYYY-MM` 문자열이므로 `<=` 비교 유효 (lexicographic order)
5. **debts.monthly_interest:** DB에 저장하지 않고 쿼리 시 `ROUND(balance * annual_rate / 100 / 12)` 계산
