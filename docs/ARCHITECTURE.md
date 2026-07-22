# Finance Tracker 아키텍처 문서

## 개요/목적

로컬 단일 프로세스 웹앱으로, Express가 REST API와 빌드된 React 프론트엔드를 함께 서빙합니다. 인증 없이 클라우드 없이 `npm start` 한 줄로 로컬에서 구동됩니다. 데이터는 SQLite (better-sqlite3)에 저장됩니다.

## 기술 스택

- **런타임**: Node.js
- **백엔드**: Express
- **DB**: SQLite (better-sqlite3)
- **프론트엔드**: React + Vite
- **차트**: Recharts
- **스타일**: Tailwind CSS

## 컴포넌트 구조

### 백엔드

- `src/server.js`: Express 진입점 (port 3000)
- `src/db/init.js`: SQLite 스키마 + 연결
- `src/routes/`: REST API 라우터
  - `transactions.js`: 거래 CRUD + 대시보드 집계
  - `categories.js`: 카테고리 CRUD
  - `paymentMethods.js`: 결제수단 CRUD

### 프론트엔드

- `client/src/`
  - `pages/`: Dashboard, Transactions 등
  - `components/`: TransactionForm, TransactionList 등

### DB

- `data/finance.db`: SQLite DB 파일 (WAL 모드)

## 데이터 흐름

시스템 아키텍처는 다음 그림과 같습니다: [docs/diagrams/01-system-architecture.md](./diagrams/01-system-architecture.md)

거래 입력 흐름은 아래와 같습니다: [docs/diagrams/02-transaction-flow.md](./diagrams/02-transaction-flow.md)

이중계산 방지 로직은 아래와 같습니다: [docs/diagrams/03-double-counting-prevention.md](./diagrams/03-double-counting-prevention.md)

마이너스통장 이자 자가증식 흐름은 아래와 같습니다: [docs/diagrams/04-minus-tongjang-interest.md](./diagrams/04-minus-tongjang-interest.md)

대시보드 데이터 집계 흐름은 아래와 같습니다: [docs/diagrams/05-dashboard-aggregation.md](./diagrams/05-dashboard-aggregation.md)

## 핵심 설계 원칙

- 로컬 단일 프로세스 구조로, 서버 없이 직접 파일 시스템에서 실행 가능
- SQLite 파일 하나로 모든 데이터 저장 — 백업은 파일 복사로 충분
- 할부·리볼빙 결제는 전용 테이블에 기록하여 이중계산 방지
- 수동 및 자동 카테고리 제안 로직 지원