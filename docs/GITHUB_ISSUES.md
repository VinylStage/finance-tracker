# GitHub Issues — finance-tracker Phase 2~6

> 이 파일을 GitHub에 이슈로 등록할 때 복사해서 사용하세요.  
> 각 이슈는 별도의 GitHub Issue로 등록 권장.

---

## Issue #1: Phase 2 — Installment management UI

**Labels:** `phase-2`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
할부 구매 내역을 등록하고, 이번달 청구 합계를 자동 계산하는 UI/API 구현.

### API
- `POST /api/installments` — 할부 등록
- `GET /api/installments?status=진행중` — 목록 (remaining_months 포함)
- `PUT /api/installments/:id` — 수정/완료처리
- `DELETE /api/installments/:id` — 삭제

### Acceptance Criteria
- [ ] `src/routes/installments.js` 구현 및 `server.js`에 등록됨
- [ ] `remaining_months` = `months - billed_months` 계산이 정확함 (음수 시 0 처리)
- [ ] `Installments.jsx` 페이지에서 진행중/완료 필터 동작
- [ ] 이번달 청구 합계가 상단 summary에 표시됨
- [ ] 잔여 0개월 항목에 "완료처리" 버튼 표시
- [ ] 할부 등록 시 `transactions` 테이블에는 기록하지 않음 (이중계산 방지)

### Notes
- `start_billing_month` 형식: `YYYY-MM` (TEXT 비교)
- 상세 설계: `docs/PHASE2_DESIGN.md` §2

---

## Issue #2: Phase 2 — Revolving ledger UI

**Labels:** `phase-2`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
리볼빙 카드 이월잔액을 월별로 기록하는 원장 페이지 구현.

### API
- `POST /api/revolving` — 월 원장 기록
- `GET /api/revolving?payment_method_id=` — 원장 이력
- `PUT /api/revolving/:id` — 수정
- `DELETE /api/revolving/:id` — 삭제

### Acceptance Criteria
- [ ] `src/routes/revolving.js` 구현 및 `server.js`에 등록됨
- [ ] `next_carried_balance = carried_balance + new_charge - paid_amount + interest` 자동 계산
- [ ] `(month, payment_method_id)` UNIQUE 인덱스 추가 (`db/init.js`)
- [ ] `Revolving.jsx`에서 카드별 필터 동작
- [ ] 현재 이월잔액(가장 최근 `next_carried_balance`) 상단 표시

### Notes
- DB 수정 필요: `CREATE UNIQUE INDEX idx_revolving_month_pm ON revolving_history(month, payment_method_id)`
- 상세 설계: `docs/PHASE2_DESIGN.md` §3

---

## Issue #3: Phase 2 — Debt status page

**Labels:** `phase-2`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
대출/부채 현황을 등록·조회하고 총 부채와 월이자를 요약하는 페이지.

### API
- `GET /api/debts` — 목록 + monthly_interest 계산
- `POST /api/debts` — 등록
- `PUT /api/debts/:id` — 잔액/금리 업데이트
- `DELETE /api/debts/:id` — 삭제

### Acceptance Criteria
- [ ] `src/routes/debts.js` 구현 및 `server.js`에 등록됨
- [ ] `monthly_interest = ROUND(balance * annual_rate / 100 / 12)` 쿼리 시 계산
- [ ] `Debts.jsx`에서 총 부채 합계, 월이자 합계 카드 표시
- [ ] 잔액 업데이트 시 `updated_at` 자동 갱신

### Notes
- `monthly_interest`는 DB에 저장하지 않고 쿼리 시 계산
- 상세 설계: `docs/PHASE2_DESIGN.md` §4

---

## Issue #4: Phase 2 — Double-counting prevention validation

**Labels:** `phase-2`, `bug`, `backend`

**Body:**

### Goal
대시보드 가용현금 계산에서 할부/리볼빙 이중계산 방지 로직을 완성하고 검증.

### Acceptance Criteria
- [ ] 대시보드 쿼리에서 `payment_style IN ('할부','리볼빙')` 거래가 지출 합계에 포함되지 않음
- [ ] 리볼빙 `paid_amount`가 대시보드 가용현금 계산에 반영됨 (현재 누락)
- [ ] 가용현금 수식: `income - expense(일시불) - installments_due - revolving_paid`
- [ ] 테스트: 할부 등록 후 대시보드 available 수치가 정확함
- [ ] 테스트: 리볼빙 납부 기록 후 대시보드 available 수치가 정확함

### Notes
현재 `transactions.js` `/summary/dashboard`에 `revolving paid_amount` 집계가 없음 → 추가 필요.
상세 수식: `docs/PHASE2_DESIGN.md` §5

---

## Issue #5: Phase 3 — Category auto-suggest UX improvements

**Labels:** `phase-3`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
가맹점 입력 시 카테고리 자동제안의 confidence를 UI로 표시하고, 가맹점 자동완성 드롭다운 추가.

### API 변경
- `GET /api/transactions/suggest/category` 응답에 `confidence`, `category_name` 필드 추가
- `GET /api/transactions/merchants/recent?q=&limit=10` 신규 추가

### Acceptance Criteria
- [ ] 카테고리 자동제안 응답에 `confidence: 'exact' | 'partial' | 'none'` 포함
- [ ] `exact` 매칭 시 🟢 뱃지, `partial` 매칭 시 🟡 뱃지 표시
- [ ] 가맹점 입력 중 debounce 300ms 후 자동완성 드롭다운 표시
- [ ] 자동완성 목록: 최근 사용순 최대 10개
- [ ] 자동완성 선택 시 카테고리 자동제안 즉시 실행
- [ ] 전체 응답 시간 < 100ms (SQLite 로컬이므로 충분히 달성 가능)

### Notes
상세 설계: `docs/PHASE3_4_DESIGN.md` §3

---

## Issue #6: Phase 4 — Cash flow graph (Recharts LineChart)

**Labels:** `phase-4`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
일/주/월/연 단위 수입-지출 추이를 LineChart로 시각화.

### API
- `GET /api/cashflow?granularity=monthly&from=&to=`
  - 응답: `{ period, income, expense, installments_due, net }[]`

### Acceptance Criteria
- [ ] `src/routes/cashflow.js` 구현 및 `server.js`에 등록됨
- [ ] `granularity`: `daily`, `weekly`, `monthly`, `yearly` 모두 동작
- [ ] `from`/`to` 범위 필터 동작
- [ ] `CashFlow.jsx` 페이지에 PeriodSelector + LineChart 렌더링
- [ ] 수입(초록), 지출(빨강), 순수지(파랑 점선) 3개 Line 표시
- [ ] YAxis 단위 '만원' 포맷 (`450000` → `45만`)
- [ ] 거래 저장 후 그래프 자동 갱신 (React Query invalidation)

### Notes
- SQLite `strftime` 기반 집계
- 상세 설계: `docs/PHASE3_4_DESIGN.md` §4

---

## Issue #7: Phase 4 — Expense category chart

**Labels:** `phase-4`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
기간 내 카테고리별 지출을 수평 BarChart로 시각화.

### API
- `GET /api/cashflow/by-category?from=&to=`
  - 응답: `{ category_name, major_type, total, pct }[]`

### Acceptance Criteria
- [ ] `cashflow.js`에 `/by-category` 라우트 추가
- [ ] `major_type`별 색상 구분 (고정지출/변동필수/부채상환/선택지출/저축)
- [ ] 지출 비율(`pct`) 툴팁 표시
- [ ] `CashFlow.jsx` 하단에 CategoryBarChart 렌더링
- [ ] 할부/리볼빙은 카테고리 집계에서 제외

### Notes
상세 설계: `docs/PHASE3_4_DESIGN.md` §4.3, §4.4

---

## Issue #8: Phase 5 — Balance simulator

**Labels:** `phase-5`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
현재 수입/지출/할부 패턴을 기반으로 N개월 후 잔액을 시뮬레이션.

### API 설계 (신규)
- `POST /api/simulator` — 시뮬레이션 실행
  - Body: `{ months: 6, monthly_income, monthly_expense_override, extra_savings }`
  - 응답: `{ projections: [{ month, projected_balance, cumulative }][] }`

### Acceptance Criteria
- [ ] `Simulator.jsx` 페이지 구현
- [ ] 입력: 예상 월수입, 월지출 조정값, 추가 저축액
- [ ] N개월 프로젝션 LineChart 표시
- [ ] 기본값: 최근 3개월 평균 수입/지출 자동 채워짐
- [ ] 시뮬레이터 결과가 대시보드 balance 로직과 동일한 수식 사용

### Notes
Phase 5 상세 설계 문서 미작성 — 구현 전 PHASE5_DESIGN.md 별도 작성 필요.

---

## Issue #9: Phase 5 — Savings/insurance ledger

**Labels:** `phase-5`, `enhancement`, `frontend`, `backend`

**Body:**

### Goal
적금/보험 상품 등록 및 만기처리 흐름 구현.

### API (신규)
- CRUD `/api/savings`
- `PUT /api/savings/:id/mature` — 만기처리 (status → '만기')

### Acceptance Criteria
- [ ] `src/routes/savings.js` 구현 및 `server.js`에 등록됨
- [ ] `Savings.jsx`에서 진행중/만기 필터 동작
- [ ] 만기처리 시 `expected_payout` 수익 분리: 원금 회수 vs 이자 수입
  - 이자 수입 부분은 `transactions`에 '수입' 카테고리로 자동 등록 여부 UX 확인
- [ ] 이번달 납입 합계 대시보드 카드에 표시

### Notes
`savings_products` 테이블은 Phase 0에서 이미 스키마 완성.

---

## Issue #10: Phase 6 — CSV/JSON export

**Labels:** `phase-6`, `enhancement`, `backend`, `frontend`

**Body:**

### Goal
거래 내역을 CSV 또는 JSON 파일로 내보내기.

### API (신규)
- `GET /api/export?format=csv|json&from=&to=`
  - `Content-Disposition: attachment; filename="transactions_YYYY-MM.csv"`

### Acceptance Criteria
- [ ] CSV: BOM 포함 (한국어 Excel 호환), 컬럼: 날짜/카테고리/금액/결제수단/결제방식/가맹점/메모
- [ ] JSON: 트랜잭션 배열 + 메타데이터(`exported_at`, `total_count`)
- [ ] 날짜 범위 필터 (`from`, `to`) 동작
- [ ] 설정 페이지 또는 대시보드에서 내보내기 버튼 접근 가능

### Notes
better-sqlite3는 동기 API이므로 스트리밍 없이 전체 결과 빌드 후 응답 가능.  
5,000건 기준 < 1초 (Phase 6 성능 기준).

---

## Issue #11: Phase 6 — Settings page (categories, payment methods, budget)

**Labels:** `phase-6`, `enhancement`, `frontend`

**Body:**

### Goal
카테고리, 결제수단, 예산 설정을 UI에서 관리할 수 있는 설정 페이지.

### Acceptance Criteria
- [ ] `Settings.jsx` 페이지 구현 (탭: 카테고리 / 결제수단 / 예산)
- [ ] 카테고리: 추가/수정/비활성화 (`is_active` toggle)
- [ ] 결제수단: 추가/수정/비활성화
- [ ] 예산: 카테고리별 `monthly_budget` 인라인 수정 가능
- [ ] 비활성화된 항목은 거래 입력 폼 드롭다운에서 미표시
- [ ] 카테고리 삭제 방지: 연결된 거래가 있으면 soft-delete만 허용

### Notes
API 이미 존재: `/api/categories`, `/api/payment-methods` (CRUD 완성).  
이슈 범위: 프론트엔드 Settings UI만.

---

## Issue #12: Phase 6 — Mobile responsive polish

**Labels:** `phase-6`, `enhancement`, `frontend`

**Body:**

### Goal
모바일 브라우저(iPhone Safari, Android Chrome)에서 주요 화면 사용성 확보.

### Acceptance Criteria
- [ ] 대시보드 카드: 세로 스택 (모바일 너비 < 640px)
- [ ] 거래 입력 폼: 풀 너비, 버튼 충분한 터치 영역 (44px+)
- [ ] 거래 목록 테이블: 좌우 스크롤 가능 또는 카드 뷰 전환
- [ ] 그래프(CashFlow): 모바일에서 가로 스크롤 또는 기간 자동 축소
- [ ] 네비게이션: 햄버거 메뉴 또는 하단 탭바
- [ ] 5,000건 기준 모바일 Safari에서 첫 렌더 < 2초

### Notes
Tailwind CSS `sm:` / `md:` breakpoint 활용.  
실기기 테스트: iPhone (Safari) + Android (Chrome) 권장.
