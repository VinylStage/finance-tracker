# 아키텍처 문서

## 개요

단일 프로세스 로컬 웹앱. Express가 REST API와 빌드된 React 프론트엔드를 함께 서빙.
인증 없음, 클라우드 없음 — `npm start` 한 줄로 로컬에서 구동.

```
브라우저 → localhost:3000 → Express
                              ├── /api/*     → SQLite (better-sqlite3)
                              └── /*         → React 빌드 (public/)
```

## 기술 스택

| 영역 | 선택 | 사유 |
|---|---|---|
| 런타임 | Node.js | 로컬 실행, 설치 간단 |
| 백엔드 | Express | 별도 프레임워크 학습비용 없이 REST API |
| DB | SQLite (better-sqlite3) | 파일 하나, 서버 불필요, 백업 = 파일 복사 |
| 프론트엔드 | React + Vite | 실시간 리렌더링, 컴포넌트 재사용 |
| 차트 | Recharts | 선형/막대 그래프, 반응형, React 친화적 |
| 스타일 | Tailwind CSS | 빠른 UI 구축 |

## 디렉토리 구조

```
finace-tracker/
├── src/
│   ├── server.js              # Express 진입점 (port 3000)
│   ├── db/init.js             # SQLite 스키마 + 연결
│   └── routes/                # REST API 라우터
│       ├── transactions.js    # 거래 CRUD + 대시보드 집계
│       ├── categories.js      # 카테고리 CRUD
│       └── paymentMethods.js  # 결제수단 CRUD
├── client/                    # React + Vite 프론트엔드
│   └── src/
│       ├── pages/             # Dashboard, Transactions
│       └── components/        # TransactionForm, TransactionList
├── data/                      # SQLite DB 파일 (git 제외)
├── docs/                      # 엔지니어링 문서
├── public/                    # Vite 빌드 결과물
└── package.json
```

## DB 스키마

```sql
-- 결제수단 (카드 등)
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,              -- 신용/체크/이체/현금성
  is_active INTEGER DEFAULT 1,    -- 삭제 대신 비활성화
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 카테고리 (대분류/소분류)
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  major_type TEXT NOT NULL,        -- 수입/고정지출/변동필수/부채상환/선택지출/저축
  name TEXT NOT NULL,
  monthly_budget INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  UNIQUE(major_type, name)
);

-- 거래
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  amount INTEGER NOT NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  payment_style TEXT NOT NULL DEFAULT '일시불',  -- 일시불/할부/리볼빙/해당없음
  merchant TEXT,
  memo TEXT,
  installment_id INTEGER REFERENCES installments(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 할부
CREATE TABLE installments (
  id INTEGER PRIMARY KEY,
  purchase_date TEXT NOT NULL,
  merchant TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  months INTEGER NOT NULL,
  monthly_amount INTEGER NOT NULL,
  fee_per_month INTEGER DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  start_billing_month TEXT NOT NULL,  -- YYYY-MM
  status TEXT NOT NULL DEFAULT '진행중'  -- 진행중/완료
);

-- 리볼빙 월별 이력
CREATE TABLE revolving_history (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,
  carried_balance INTEGER DEFAULT 0,
  new_charge INTEGER DEFAULT 0,
  paid_amount INTEGER DEFAULT 0,
  interest INTEGER DEFAULT 0,
  next_carried_balance INTEGER DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id)
);

-- 부채 (수동 항목)
CREATE TABLE debts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  balance INTEGER NOT NULL,
  annual_rate REAL DEFAULT 0,
  memo TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 적금/저축성보험
CREATE TABLE savings_products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_contribution INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  maturity_date TEXT,
  expected_payout INTEGER,
  status TEXT DEFAULT '진행중'
);
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | /api/transactions | 거래 목록 (limit, offset, from, to, category_id) |
| POST | /api/transactions | 거래 생성 |
| PUT | /api/transactions/:id | 거래 수정 |
| DELETE | /api/transactions/:id | 거래 삭제 |
| GET | /api/transactions/summary/dashboard | 이번달 대시보드 집계 |
| GET | /api/transactions/suggest/category?merchant= | 카테고리 자동제안 |
| GET | /api/categories | 활성 카테고리 목록 |
| POST | /api/categories | 카테고리 생성 |
| PUT | /api/categories/:id | 카테고리 수정 |
| DELETE | /api/categories/:id | 카테고리 비활성화 |
| GET | /api/payment-methods | 활성 결제수단 목록 |
| POST | /api/payment-methods | 결제수단 생성 |
| PUT | /api/payment-methods/:id | 결제수단 수정 |
| DELETE | /api/payment-methods/:id | 결제수단 비활성화 |
| GET | /api/health | 헬스체크 |

## 이중계산 방지 원칙

할부 구매는 `installments` 테이블에만 기록 (`transactions` 미기록).
월청구는 조회 시점에 계산.

가용현금 계산:
```
수입 합계
- 지출 합계 (payment_style NOT IN ('할부','리볼빙'))
- 이번달 청구 예정 할부 monthly_amount 합계 (status='진행중')
- 이번달 리볼빙 paid_amount 합계
```

## 카테고리 자동제안 로직

```
입력: 가맹점명
1. transactions에서 merchant 완전 일치 → 가장 최근 category_id 반환
2. LIKE '%keyword%' 검색 → 빈도 최상위 category_id 반환
3. 매칭 없으면 null (사용자 수동 선택)
```
