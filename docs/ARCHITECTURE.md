# Finance Tracker 아키텍처 문서

## 개요/목적

구글 시트 / 엑셀 대체용 로컬 가계부 웹앱. 실시간 차트와 스마트 카테고리 자동제안 기능 포함. 기본값은 단일 사용자 로컬 모드로, 인증 없이 로컬에서 독립적으로 실행 가능하며 SQLite 데이터베이스를 사용해 모든 데이터를 로컬에 저장한다. 멀티유저 서비스 모드는 `AUTH_MODE` 로 옵트인한다(ADR 0005, 미구현).

## 기술 스택

- 런타임: Node.js
- 백엔드: Express
- 데이터베이스: SQLite (better-sqlite3)
- 프론트엔드: React + Vite
- 차트: Recharts
- 스타일: Tailwind CSS v4 (CSS-first, `tailwind.config` 없음)

### 시각 토큰

색은 `client/src/index.css` 의 `@theme static` 한 곳에서만 정한다. 컴포넌트는 hex 를 직접
쓰지 않고 토큰 유틸리티만 참조하며, 다크 팔레트는 `:root[data-theme='dark']` 에서 변수만
덮어써 컴포넌트 수정 없이 전환된다.

`@theme` 이 아니라 `@theme static` 인 이유는 Tailwind v4 가 유틸리티에서 참조되지 않는
변수를 출력에서 지우기 때문이다. 차트 색은 Recharts 의 `fill`/`stroke` 속성에 `var()`
문자열로 들어가 사용 사실이 감지되지 않으므로, `static` 없이는 히트맵·Sankey·모션 토큰이
CSS 에서 사라진다.

한 화면에 쓰는 hue 는 두 개다 — 액센트 블루와 손실 레드, 그 외 무채색. 카테고리에는 색을
배정하지 않고 아이콘 모양으로 구분한다. 배경 결정과 WCAG 실측값은 ADR 0006 과
`docs/design/DESIGN_TOKENS.md` 참조.

## 컴포넌트 구조

<!-- inventory:start -->

### 백엔드 라우트 (26개 파일 / API 마운트 26개)

| 마운트 | 파일 |
|---|---|
| `/api/accounts` | `accounts.js` |
| `/api/audit` | `audit.js` |
| `/api/billing-month` | `billingMonth.js` |
| `/api/card-benefits` | `cardBenefits.js` |
| `/api/card-import` | `cardImport.js` |
| `/api/card-policies` | `cardPolicies.js` |
| `/api/card-products` | `cardProducts.js` |
| `/api/card-strategy` | `cardStrategy.js` |
| `/api/cashflow` | `cashflow.js` |
| `/api/categories` | `categories.js` |
| `/api/csv-import` | `csvImport.js` |
| `/api/data` | `data.js` |
| `/api/data-integrity` | `dataIntegrity.js` |
| `/api/debts` | `debts.js` |
| `/api/exchange` | `exchange.js` |
| `/api/export` | `export.js` |
| `/api/guide` | `guide.js` |
| `/api/installments` | `installments.js` |
| `/api/payment-methods` | `paymentMethods.js` |
| `/api/recurring-rules` | `recurringRules.js` |
| `/api/revolving` | `revolving.js` |
| `/api/savings` | `savings.js` |
| `/api/settings` | `settings.js` |
| `/api/settlement` | `settlement.js` |
| `/api/stocks` | `stocks.js` |
| `/api/transactions` | `transactions.js` |

### 서비스 (28개)

`accountBalance.js` · `auditRetention.js` · `billingMonthBackfill.js` · `cardBilling.js` · `cardComparison.js` · `cardExcelImport.js` · `cardPolicy.js` · `cardRemap.js` · `cardStrategy.js` · `cardThreshold.js` · `csvImport.js` · `debtRate.js` · `debtRepayment.js` · `derivedTransactions.js` · `ecosService.js` · `eximService.js` · `installmentBilling.js` · `installmentDuplicates.js` · `kakaoCategoryMap.js` · `kakaoLocal.js` · `kisService.js` · `recurrence.js` · `recurrenceDetect.js` · `recurringCatchup.js` · `settlementBilling.js` · `settlementReclassify.js` · `transactionOrigin.js` · `undo.js`

### 프론트엔드 페이지 (13개)

`Accounts` · `AuditLog` · `CardStrategy` · `Comparison` · `Dashboard` · `Debts` · `Guide` · `Installments` · `Revolving` · `Savings` · `Settings` · `Simulator` · `Transactions`

### 프론트엔드 컴포넌트 (44개)

`AnchorNav` · `BalanceProjection` · `BillingMonthBackfillSection` · `BottomTabBar` · `CardBenefitSection` · `CardEstimateHint` · `CardPolicySection` · `CardProductSection` · `CardRemapSection` · `CashFlowBars` · `CashFlowSankey` · `CatchupNotice` · `CategoryBadge` · `CategorySpendSection` · `CommandPalette` · `ConfirmProvider` · `DebtInterestProjection` · `DebtRateHistory` · `DerivedBadge` · `DerivedTransactions` · `DuplicateCandidates` · `EmptyState` · `ErrorBoundary` · `HeatmapPeriodPicker` · `Icon` · `InstallmentBillingHint` · `InstallmentMonthsPicker` · `InstallmentRegenerate` · `LoadError` · `Modal` · `MonthCalendarGrid` · `PeriodFilter` · `RetentionNotice` · `SavingsGoalBar` · `SettlementReclassifySection` · `SpendHeatmap` · `TransactionCalendar` · `TransactionForm` · `TransactionList` · `TrustPanel` · `UndoSnackbar` · `WelcomeFlow` · `WelcomeGate` · `YearHeatmap`

### 마이그레이션 (24개)

최신: `024-recurrence-suggestion-dismissals`


<!-- inventory:end -->

> 위 목록은 `npm run docs:inventory` 가 **코드에서 생성**한다. 손으로 고치지 마라 —
> 고쳐도 다음 생성에서 덮인다.
>
> 손으로 유지하다 세 번 낡았다. 감사 FND-17(2026-07)이 같은 지적을 하며 "문서 목록을
> 코드에서 생성" 을 첫 권고로 냈는데 그때는 PR 템플릿 체크박스로 갈음했고 **또
> 낡았다**(라우트 17 → 실제 26). CI 가 `--check` 로 막는다.

## 데이터 흐름

1. [시스템 아키텍처 흐름](./diagrams/01-system-architecture.md) - 브라우저 → Express → SQLite로 이어지는 단일 프로세스 구조
2. [거래 입력 흐름](./diagrams/02-transaction-flow.md) - 가맹점명 입력 후 자동 카테고리 제안 및 저장
3. [이중계산 방지 로직](./diagrams/03-double-counting-prevention.md) - 할부·리볼빙 결제는 전용 테이블에만 기록해 지출 통계와 분리
4. [마이너스통장 이자 자가증식 흐름](./diagrams/04-minus-tongjang-interest.md) - 마이너스통장 이자 발생 시 로그 기록 및 잔액 갱신
5. [대시보드 데이터 집계 흐름](./diagrams/05-dashboard-aggregation.md) - 대시보드 정보 요청 시 병렬 엔드포인트 호출 및 집계

## 대량 목록 화면의 조회 패턴 — 서버 측 필터·집계

`Transactions.jsx`는 한때 전체 거래를 `?limit=5000`으로 한 번에 불러와 검색·월별합계·연도탭을 전부 클라이언트에서 계산했다. 서버가 `limit`을 500건으로 강제 클램프하면서(`total`은 정확했지만 화면이 안 씀), 데이터가 500건을 넘는 순간부터 검색·집계·연도탭이 조용히 "최신 500건" 범위 안에서만 맞는 상태가 됐다(독립 감사 2026-07, FND-02).

근본 해결은 **"화면에 보이는 숫자는 항상 클라이언트가 들고 있는 부분집합이 아니라 서버가 계산한 전체 결과"** 라는 원칙을 지키는 것이다. `transactions.js`가 이 패턴의 참조 구현이다:

- `GET /api/transactions/years` — 존재하는 연도 목록을 서버가 `DISTINCT`로 직접 계산. 탭 목록이 클라이언트가 로드한 부분집합에서 파생되지 않는다.
- `GET /api/transactions/summary/by-month?year=` — 월별 합계·건수를 서버가 `GROUP BY`로 직접 계산. 검색 필터가 걸려도 합계는 항상 그 필터에 해당하는 전체 데이터 기준이다.
- 실제 행(목록)은 사용자가 지금 펼친 범위(예: 펼친 달)만 서버에 요청한다 — 화면에 보이지 않는 데이터까지 미리 클라이언트 메모리에 올리지 않는다.
- 필터(가맹점/메모/금액범위/결제수단/카테고리)는 위 세 조회가 공유하는 단일 WHERE 절 빌더(`buildTransactionFilters`)로 전달돼, 어느 조회를 쓰든 같은 데이터를 가리킨다.

앞으로 목록 화면에 검색·필터·집계를 추가할 때는 "전체를 불러와 클라이언트에서 거른다"가 아니라 이 패턴(서버 집계 + 필요한 범위만 조회)을 기본값으로 삼는다.

## 핵심 설계 원칙

1. 기본은 단일 사용자, 로컬 전용: 인증 없이 실행 가능한 독립형 애플리케이션. 멀티유저는 `AUTH_MODE` 로 옵트인하는 별도 모드이며 아직 구현돼 있지 않다 (아래 «네트워크 바인딩 및 인증 정책», ADR 0005 참조)
2. 데이터베이스: SQLite (WAL 모드)로 모든 데이터를 로컬 파일에서 관리
3. 실시간 피드백: 가맹점명 입력 후 자동 카테고리 제안 및 이력 추적
4. 정확한 집계: 할부/리볼빙은 전용 테이블에 기록하여 이중계산 방지
5. 확장성: 모듈식 구조로 새로운 카테고리와 결제수단을 자유롭게 추가 가능
6. **빠뜨려도 구멍이 안 나는 구조를 고른다**: 감사 캡처를 라우트가 아니라 DB 트리거로
   둔 이유다. 라우트 기록은 새 라우트를 쓰는 사람이 한 줄 빠뜨리면 그 경로만 조용히
   안 남는다 (#296)
7. **조용히 덮어쓰지 않는다**: 되돌리기는 쓰기 전에 현재 값이 기록과 같은지 보고,
   다르면 거부한다. 그 사이 누군가 또 바꾼 것을 덮는 것이 최악이다 (#300)
8. **모르는 것을 채우지 않는다**: 카드 결제일·마감일, 기존 거래의 카드 상품은 비워 둔다.
   추측해서 채우면 계산이 **틀린 답을 자신 있게** 낸다 (#274, #306)
9. **데이터를 대량으로 바꾸는 동작은 프리뷰 → 확인 → 실행**: 한 건씩 하는 일반 CRUD 는
   해당하지 않는다. 다만 되돌릴 수 없는 동작에는 확인을 받는다 (ADR 0008)

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

### 신뢰 경계에 포함되지 않는 것 — 같은 기기의 브라우저

루프백 바인딩은 **다른 기기로부터의 접근**은 막지만 **같은 기기의 브라우저가 방문하는 임의 웹사이트로부터의 접근**은 막지 못한다. 이 앱이 켜져 있는 상태에서 사용자가 다른 웹사이트를 방문하면, 그 페이지의 HTML `<form>`이나 `fetch()`가 인증 없이 `http://127.0.0.1:3000`의 API를 그대로 호출할 수 있다 — 독립 감사(2026-07, FND-01)가 CSRF로 전체 거래내역을 원격 삭제하는 것을 실증했다.

**이 간극은 네트워크 바인딩으로 막을 수 없다.** 대응은 애플리케이션 계층의 별도 방어다 — `src/utils/csrfGuard.js`가 상태 변경 요청(POST/PUT/DELETE/PATCH)에 대해 `Sec-Fetch-Site`(우선) 또는 `Origin`(폴백) 헤더로 같은 오리진에서 온 요청인지 검증하고, 아니면 403으로 거부한다. GET 요청은 부작용이 없다는 전제로 검증 대상에서 제외한다.

즉 네트워크 바인딩(다른 기기 차단)과 CSRF 가드(같은 기기의 다른 웹사이트 차단)는 서로 다른 위협을 막는 별개의 통제이며, 인증 계층이 없는 이 앱에서는 **둘 다 필요**하다.

### 모드별 통제 차이

위 통제(루프백 바인딩 + CSRF 가드)는 **인증이 없는 상태를 전제로 한 조합**이다. 인증이 들어오면 통제 구성이 달라진다.

| | 단일 사용자 모드 (현재, 기본값) | 멀티유저 서비스 모드 (미구현) |
|---|---|---|
| 신원 확인 | 없음 | 세션 쿠키 |
| 1차 CSRF 방어 | 없음 | `SameSite=Strict` 쿠키 |
| 2차 CSRF 방어 | `csrfGuard` (`Sec-Fetch-Site`/`Origin`) | 동일하되 폴백 규칙을 좁힘 |
| 네트워크 노출 | 루프백 기본 | 공개 노출 + HTTPS 필수 |
| 데이터 격리 | 불필요 | 모든 쿼리를 `user_id` 로 스코프 |

특히 `csrfGuard` 의 현재 폴백 — 브라우저 신호가 하나도 없으면 통과시키는 규칙 — 은 **훔칠 자격증명이 없기 때문에** 안전하다. 세션 쿠키가 생기면 이 전제가 깨지므로 규칙을 함께 바꿔야 한다. 자세한 것은 ADR 0005 를 참조한다.

### 관련 결정

- 인증·세션 전략과 CSRF 재설계 방향은 `docs/decisions/0005-authentication-strategy.md` 에 있다.
- 무인증 상태에서의 잔존 리스크는 `docs/decisions/0003-xlsx-vulnerability-risk-acceptance.md`(→ `0004-xlsx-vendored-upgrade.md` 로 대체)에 기록돼 있다.
- 외부 터널링(ngrok 등)은 사용하지 않는다.
- 파괴적 엔드포인트(전체 삭제 등)를 새로 추가할 때는 CSRF 가드가 해당 라우트를 실제로 커버하는지 PR에서 확인한다.

## 감사 캡처와 실행취소 (#296~#301)

쓰기를 남기는 층을 **DB 트리거**로 뒀다. 라우트가 직접 기록하는 방식은 새 라우트를
쓰는 사람이 한 줄 빠뜨리면 그 경로만 조용히 안 남는다.

    요청 → auditContext 미들웨어 → _audit_context 단일 행에 actor/action_id 기록
         → 라우트가 쓰기 → 트리거가 _audit_context 를 읽어 audit_log 에 적음

**트리거는 JS 상태를 볼 수 없다.** `_audit_context` 테이블이 그 사이를 잇는다. 단일
행으로 성립하는 근거는 better-sqlite3 가 동기이고 이 앱이 단일 프로세스·단일
커넥션이라는 점이다 — **이건 전제다.** 커넥션 풀이나 워커 스레드가 들어오면 깨지고,
그때는 `AsyncLocalStorage` 로 바꿔야 한다.

사용자 요청 안에서 일어나지만 사용자가 지시하지 않은 쓰기(조회 때 도는 만료 할부
자동 완료 등)는 `runAs('system', fn)` 으로 감싼다. `user` 로 찍히면 실행취소가
엉뚱한 것을 되돌린다.

되돌리기의 단위는 `action_id` 다 — 한 요청이 만든 모든 행이 같이 되돌아간다.

## 기동 시 따라잡기 (#279)

이 앱은 **사용자가 열 때만 프로세스가 산다.** 상시 구동 전제의 스케줄러는 이 배포
형태에서 동작하지 않으므로, 반복 거래는 서버 기동 시점에 "마지막으로 처리한 날
이후 지금까지" 를 메운다.

상한을 두지 않는다. 공백이 길어도 규칙대로 전부 만든다 — 사용자가 규칙으로 이미
의사를 밝혔는데 "156건을 만들까요" 를 되묻는 것은 규칙의 취지를 없앤다. 대신
**무엇이 새로 생겼는지 화면이 반드시 알린다**(대시보드 상단 배너).

멱등성은 `recurring_occurrences` 의 `UNIQUE(rule_id, occurred_on)` 이 보장한다.
애플리케이션에서 "이미 있나 확인 후 삽입" 하면 확인과 삽입 사이에 경쟁이 생긴다.

실패해도 서버는 떠야 하므로 기동 경로에서 예외를 삼키고, 다음 기동에서 같은 구간을
다시 시도한다.

## 동시 세션 — git worktree 로 격리

여러 세션이 같은 저장소를 동시에 만질 때 메인 체크아웃에서 `git checkout` 하면 상대
세션의 작업 트리를 옮겨 버린다. 각자 `git worktree` 로 별도 트리를 판다.

- 브랜치는 항상 `origin/develop` 에서 딴다 (스쿼시 머지라 스택 브랜치가 깨진다)
- 마이그레이션 번호는 **모든 원격 브랜치**를 확인하고 고른다. develop 만 보면 충돌한다
- 미리보기 서버는 실거래 DB 가 아니라 백업 사본을 `DB_PATH` 로 물리고 기본 포트를 피한다
- `.githooks/staging-guard` 가 심링크·대용량 파일을 커밋 전에 막는다 (#347)
