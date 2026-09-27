# MCP 연동 리서치 (2026-09)

> 조사일 2026-09-28. 이 문서는 **조사 기록**이다. 결정이 아니다 — 결정은 F0 이슈가 낼
> ADR 이 한다. 이 문서에서 나온 이슈는 마일스톤 `M18. MCP 연동` 에 있다.

## 왜 조사했나

지금 이 앱의 모든 기능은 화면으로만 쓸 수 있다. Claude Desktop·ChatGPT 같은 LLM
클라이언트에서 가계부를 자연어로 조회·입력하는 흐름이 개인금융 앱들 사이에서 퍼지고
있어서, 이 앱에 MCP(Model Context Protocol) 서버를 붙이면 무엇을 할 수 있고 무엇을
조심해야 하는지 정리했다.

## 1. 비교 대상 앱

확신도 표기: **확인** = 1차 출처(공식 발표·저장소 README)로 확인, **보통** = 2차 출처만,
**미확인** = 출처끼리 상충하거나 1차 출처를 못 찾음.

| 앱 | MCP / LLM 연동 | 무엇을 어떻게 노출하나 | 확신도 |
|---|---|---|---|
| YNAB | 커뮤니티 MCP 다수 (jsclayton, calebl, mattweg 등) | 조회+쓰기. `YNAB_READ_ONLY` 가 켜지면 쓰기 툴 전부 차단. 대사(reconciliation)는 미정리 거래를 한 건씩 확인시키고 확인된 것만 일괄 반영 | 확인 |
| Actual Budget (OSS) | 커뮤니티 MCP (s-stefanov ~20툴, agigante80 81툴) | 조회 툴: `get-transactions`, `spending-by-category`, `monthly-summary`, `budget-vs-actual`, `category-trends`, `spending-by-payee`, `cash-flow`, `net-worth`. 쓰기는 `--enable-write` 로만 열린다(기본 꺼짐). Prompts: `financial-insights`, `budget-review` | 확인 |
| Copilot Money | 커뮤니티 MCP (dakaneye, ignaciohermosillacornejo). 공식 MCP 는 대기자 명단·읽기 전용이라고 함 | 조회는 Mac 앱의 로컬 캐시에서, 응답에 캐시 시각(`cacheUpdatedAt`) 포함. 쓰기는 ~60분 만료 토큰이 있어야 열림. `suggest_categories` → `bulk_categorize`/`bulk_review` | 커뮤니티: 확인 / 공식: 보통 |
| Monarch Money | 커뮤니티 MCP (robcerda, jamiew, colvint 등). 역공학 라이브러리 기반, 계정 비밀번호·MFA 시크릿을 설정 파일에 둠 | jamiew 판은 기본 읽기 전용, 쓰기 툴은 숨겼다가 옵트인. 35툴(거래·예산·반복·영수증·태그) | 커뮤니티: 확인 / 공식 MCP 존재: **미확인** (출처 상충) |
| ChatGPT Finances (2026-05) | OpenAI 공식, Plaid 경유 | **읽기 전용** — 결제·이체·계좌 변경 불가. "요즘 지출이 늘었나? 뭐가 바뀌었나?" 식 질의, 구독·예정 결제 대시보드. 연결 해제 시 30일 뒤 동기화 데이터 삭제, 금융 메모리 개별 삭제 가능 | 확인 |
| Era (2026-05) | Claude 디렉터리 최초의 개인금융 커넥터, 공식 MCP | 지출 패턴을 읽어 사용자 맞춤 카테고리 체계를 **설계하고, 분류 규칙을 만들어 과거 거래에 소급 적용** 하는 쓰기 기능. 목표·선호를 세션 간에 유지하는 메모리 계층 | 확인 (보도자료) |
| Perplexity (2026-04) | 은행·카드·대출 연결 지원 | 세부 미조사 | 보통 |
| 뱅크샐러드 | 자체 금융 AI 에이전트 (2026 핵심 전략) | 카드 피킹률 자동 계산, 대화형 정보 제공(토핑+), 가계부 2.0. **외부 LLM/MCP 연동 언급 없음** | 보통 |
| 토스 | 토스뱅크 상담 AI 에이전트, 토스증권 AI | MCP 는 토스페이먼츠 **개발 문서 검색용**만 공개. 가계부 데이터를 외부 LLM 에 노출하는 사례 없음 | 보통 |
| Mint | 2024 년 서비스 종료 | — | 확인 |

### 공통 패턴

1. **읽기 전용이 기본값, 쓰기는 명시적 옵트인** — YNAB(`READ_ONLY`), Actual(`--enable-write`),
   Monarch(jamiew, 쓰기 툴 숨김), Copilot(토큰 게이트). 공식 제품(ChatGPT, Copilot 공식)은
   아예 읽기 전용으로 출발했다.
2. **일괄 변경은 제안 → 승인 → 반영** — Copilot `suggest_categories` → `bulk_categorize`,
   YNAB 대사 흐름. 이 저장소의 ADR 0008(프리뷰 → 확인 → 실행)과 같은 모양이다.
3. **분석은 서버가 집계해 준다** — 원시 거래를 통째로 넘기지 않고 카테고리·기간·가맹점
   단위 집계 툴을 둔다. 토큰 비용과 LLM 의 산술 오류를 둘 다 줄인다.
4. **데이터 신선도를 응답에 싣는다** — Copilot 의 `cacheUpdatedAt`.
5. **국내 앱은 폐쇄형** — 국내 PFM 은 자체 AI 에 투자하지 외부 LLM 에 데이터를 열지 않는다.
   로컬 단독 앱인 이 저장소는 그 제약이 없다.

## 2. 이 앱의 조건 — 코드에서 확인한 제약

### 2.1 MCP 서버는 SQLite 를 직접 열면 안 된다

`src/utils/auditContext.js` 의 감사 컨텍스트는 **단일 프로세스·단일 커넥션이라는 전제**로
`_audit_context` 단일 행을 쓴다. MCP 서버가 별도 프로세스로 DB 를 열어 쓰면 트리거가
엉뚱한 actor·action_id 를 읽는다. 따라서 MCP 는 **로컬 HTTP API(127.0.0.1) 를 경유**하거나
Express 프로세스 안에 붙어야 한다.

### 2.2 실행취소는 `actor='user'` 만 대상이다

`src/services/undo.js` 는 `actor = 'user'` 행만 되돌린다. MCP 쓰기에 새 actor(`mcp` 등)를
붙이면 **AI 가 잘못 쓴 것을 되돌릴 수 없다.** 구분(감사 추적)과 되돌림(안전망) 둘 다 필요해서
정책 결정이 필요하다.

### 2.3 CSRF 가드는 브라우저 신호가 없는 요청을 통과시킨다

`src/utils/csrfGuard.js` 는 `Sec-Fetch-Site`/`Origin` 이 둘 다 없으면 통과시킨다.
MCP 브리지(비브라우저)는 그대로 동작한다. 다만 이것은 "훔칠 자격증명이 없어서 안전하다"는
전제에 기대고 있으므로(ARCHITECTURE.md), MCP 가 새 신뢰 경계를 만들지 않는다는 점을 ADR 에
명시해야 한다.

### 2.4 PII

- 카드번호는 저장하지 않는다(임포트 파서가 읽지 않음).
- `transactions.approval_number`(카드 승인번호)는 저장된다 — 중복 판정용이다. **MCP 응답에서
  기본 제외**한다. LLM 대화 로그는 이 앱의 신뢰 경계 밖(클라이언트·LLM 공급자)으로 나간다.
- 메모(`memo`) 는 사용자가 자유 입력한다 — 노출 여부를 설정으로 둘지 F0 에서 정한다.

### 2.5 MCP 는 먼저 말을 걸 수 없다

MCP 는 클라이언트가 부르는 pull 방식이다. "예산 초과 알림" 은 푸시가 아니라 사용자가
물었을 때(또는 클라이언트 쪽 스케줄이 불렀을 때) 답하는 **점검** 으로만 구현된다.

### 2.6 앱은 열 때만 산다

반복거래 따라잡기(#279) 가 전제하듯 서버는 사용자가 열 때만 떠 있다. MCP 브리지는 서버가
꺼져 있을 때의 동작(명확한 오류 / 자동 기동)을 정해야 한다.

### 2.7 파생 거래는 잠겨 있다

`origin != 'manual'` 거래는 수정·삭제할 수 없다(DATA_MODEL.md). MCP 쓰기 툴도 같은
잠금을 따라야 하고, 이미 라우트가 막고 있으므로 **라우트를 경유하는 한 자동으로 지켜진다.**
DB 직접 접근을 금하는 또 하나의 이유다.

## 3. 제안 — 이슈 목록

의존: F0 → A* → B*. 우선순위·난이도는 제안 시점 의견이다.

| 구분 | 이슈 | 우선순위 | 난이도 |
|---|---|---|---|
| F0 | MCP 서버 기반과 ADR (전송, HTTP 경유, 읽기 전용 기본, 툴 annotation, 감사 actor·실행취소, PII 제외) | P1 | 중 |
| A1 | 거래·집계 조회 툴 (검색, 월별 합계, 카테고리 분석, 기간 비교, 현금흐름, 예산 대비) | P1 | 하 |
| A2 | 거래·카테고리 쓰기 툴 (manual 거래 CRUD, 예산 수정, 실행취소) | P2 | 중 |
| A3 | 카드 혜택·실적·전략 조회 툴 | P1 | 하 |
| A4 | 할부·리볼빙·부채·저축 조회 툴 | P2 | 하 |
| A5 | 반복거래·구독 툴 (규칙·예정 조회, 감지 후보 대화형 수락/거절) | P3 | 하~중 |
| B1 | 자연어 질의 지원 (이름→id 해석, 기간 해석 가드, MCP Prompts) | P1 | 하~중 |
| B2 | 카테고리 자동 분류 제안 (프리뷰 → 확인 → 일괄 적용) | P2 | 중 |
| B3 | 대화형 카드 추천 (자유 텍스트 가맹점 → 업종 → 추정 + 근거) | P1 | 중 |
| B4 | 영수증·명세서·문자 파싱 입력 (초안 → 중복 검사 → 확인 → 저장) | P2 | 중상 |
| B5 | 이상거래·중복 대화형 확인 | P3 | 중 |
| B6 | 예산 초과 대화형 점검 (pull 한계 명시) | P2 | 하 |

### 등록된 이슈 (2026-09-28, 마일스톤 `M18. MCP 연동`)

| 구분 | 이슈 |
|---|---|
| F0 | #739 |
| A1 · A2 · A3 · A4 · A5 | #740 · #741 · #742 · #743 · #744 |
| B1 · B2 · B3 · B4 · B5 · B6 | #745 · #746 · #747 · #748 · #749 · #750 |

### 이슈 작성 중 코드에서 추가로 확인한 것

- `GET /api/transactions` 는 `t.*` 를 내보내 `approval_number` 가 응답에 포함된다 → #739 의
  응답 화이트리스트 투영 근거
- 예산 3단계 판정(#193)은 **클라이언트에만** 있다(`client/src/lib/budget.js`) → #750 이 판정을 한 곳으로
  모으는 작업을 포함
- `merchant_category_map.source` 는 `manual`/`kakao`/`history` 세 값, CHECK 제약 없음 → #746 의
  LLM 확인 매핑 표기 결정
- 반복 후보 응답 필드는 `amount_varies`/`day_varies` (`recurrenceDetect.js`)

## 출처

- YNAB: https://github.com/jsclayton/ynab-mcp , https://github.com/calebl/ynab-mcp-server
- Actual Budget: https://github.com/s-stefanov/actual-mcp , https://mcpservers.org/servers/agigante80/actual-mcp-server
- Copilot Money: https://github.com/dakaneye/copilot-money-mcp , https://github.com/ignaciohermosillacornejo/copilot-money-mcp
- Monarch Money: https://github.com/jamiew/monarch-mcp , https://github.com/robcerda/monarch-mcp-server , https://www.openbudget.sh/blog/does-monarch-money-connect-to-claude
- ChatGPT Finances: https://techcrunch.com/2026/05/15/openai-launches-chatgpt-for-personal-finance-will-let-you-connect-bank-accounts/ , https://plaid.com/blog/chatgpt-personal-finance-plaid/
- Era: https://www.businesswire.com/news/home/20260506802708/en/Era-Becomes-the-First-Personal-Finance-Connector-in-Anthropics-Claude-Directory-and-Every-Other-MCP-Compatible-Agent
- 뱅크샐러드: https://www.fntimes.com/html/view.php?ud=2026032411595636146a663fbf34_18
- 토스: https://docs.tosspayments.com/guides/v2/get-started/llms-guide , https://m.news.nate.com/view/20251218n26742
