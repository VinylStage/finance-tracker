# Finance Tracker 아키텍처 문서

## 개요/목적

구글 시트 / 엑셀 대체용 로컬 가계부 웹앱. 실시간 차트와 스마트 카테고리 자동제안 기능 포함. 단일 사용자 전용으로, 인증 없이 로컬에서 독립적으로 실행 가능하며 SQLite 데이터베이스를 사용해 모든 데이터를 로컬에 저장한다.

## 기술 스택

- 런타임: Node.js
- 백엔드: Express
- 데이터베이스: SQLite (better-sqlite3)
- 프론트엔드: React + Vite
- 차트: Recharts
- 스타일: Tailwind CSS

## 컴포넌트 구조

### 백엔드 라우트 (10개):
- `cashflow.js`
- `categories.js`
- `debts.js`
- `export.js`
- `installments.js`
- `paymentMethods.js`
- `revolving.js`
- `savings.js`
- `settings.js`
- `transactions.js`

### 프론트엔드 페이지 (9개):
- `Comparison.jsx`
- `Dashboard.jsx`
- `Debts.jsx`
- `Installments.jsx`
- `Revolving.jsx`
- `Savings.jsx`
- `Settings.jsx`
- `Simulator.jsx`
- `Transactions.jsx`

### 프론트엔드 공용 컴포넌트 (2개):
- `TransactionForm.jsx`
- `TransactionList.jsx`

## 데이터 흐름

1. [시스템 아키텍처 흐름](./diagrams/01-system-architecture.md) - 브라우저 → Express → SQLite로 이어지는 단일 프로세스 구조
2. [거래 입력 흐름](./diagrams/02-transaction-flow.md) - 가맹점명 입력 후 자동 카테고리 제안 및 저장
3. [이중계산 방지 로직](./diagrams/03-double-counting-prevention.md) - 할부·리볼빙 결제는 전용 테이블에만 기록해 지출 통계와 분리
4. [마이너스통장 이자 자가증식 흐름](./diagrams/04-minus-tongjang-interest.md) - 마이너스통장 이자 발생 시 로그 기록 및 잔액 갱신
5. [대시보드 데이터 집계 흐름](./diagrams/05-dashboard-aggregation.md) - 대시보드 정보 요청 시 병렬 엔드포인트 호출 및 집계

## 핵심 설계 원칙

1. 단일 사용자, 로컬 전용: 인증 없이 실행 가능한 독립형 애플리케이션
2. 데이터베이스: SQLite (WAL 모드)로 모든 데이터를 로컬 파일에서 관리
3. 실시간 피드백: 가맹점명 입력 후 자동 카테고리 제안 및 이력 추적
4. 정확한 집계: 할부/리볼빙은 전용 테이블에 기록하여 이중계산 방지
5. 확장성: 모듈식 구조로 새로운 카테고리와 결제수단을 자유롭게 추가 가능