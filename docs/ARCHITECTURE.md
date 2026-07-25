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

1. 단일 사용자, 로컬 전용: 인증 없이 실행 가능한 독립형 애플리케이션 (아래 «네트워크 바인딩 및 인증 정책» 참조)
2. 데이터베이스: SQLite (WAL 모드)로 모든 데이터를 로컬 파일에서 관리
3. 실시간 피드백: 가맹점명 입력 후 자동 카테고리 제안 및 이력 추적
4. 정확한 집계: 할부/리볼빙은 전용 테이블에 기록하여 이중계산 방지
5. 확장성: 모듈식 구조로 새로운 카테고리와 결제수단을 자유롭게 추가 가능

## 네트워크 바인딩 및 인증 정책

이 앱은 인증 계층을 두지 않는다. 따라서 **API에 도달할 수 있는 범위를 네트워크 바인딩으로 제한하는 것이 유일한 접근 통제 수단이다.** 두 설정은 분리해서 생각할 수 없다.

### 바인딩 설정

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `HOST` | `127.0.0.1` | Express 서버가 바인딩할 주소 |
| `PORT` | `3000` | Express 서버 포트 |

- **기본값은 루프백(`127.0.0.1`)이다.** 같은 기기에서만 API에 도달할 수 있다.
- `HOST=0.0.0.0` 으로 실행하면 모든 인터페이스에 바인딩되어 **동일 네트워크의 임의 기기가 인증 없이 전 API를 호출할 수 있다.** 기동 로그에 경고 문구가 함께 출력된다.
- 기동 로그는 항상 실제 바인딩 주소를 그대로 표시한다. 로그와 실제 바인딩이 어긋나지 않아야 한다.

### 개발 시 다른 기기에서 접근하는 방법

프론트엔드 개발 서버(Vite)는 `/api` 를 `http://localhost:3000` 으로 프록시하고, 클라이언트는 전부 상대경로로 호출한다. 프록시는 Vite 프로세스 내부에서 루프백으로 연결하므로 **Express를 `0.0.0.0` 으로 열 필요가 없다.** 다른 기기에서는 Vite 개발 서버 포트로 접근한다.

예외는 `npm run build` 로 빌드한 결과물을 Express가 직접 서빙하는 경우다. 이때 다른 기기에서 접근하려면 `HOST=0.0.0.0` 이 필요하며, 그 시점에는 무인증 노출을 감수하는 것이므로 신뢰된 사설망에서만 사용해야 한다.

### 관련 결정

- 무인증 상태에서의 잔존 리스크는 `docs/decisions/0003-xlsx-vulnerability-risk-acceptance.md` 에 기록돼 있다.
- 외부 터널링(ngrok 등)은 사용하지 않는다.