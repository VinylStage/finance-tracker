# finance-tracker 독립 코드 감사 보고서 — 2026-07 사이클 1

**감사 기준**: `docs/audit/AUDIT_FRAMEWORK.md` Part 2 통합 루브릭 (축A 보안 7항목 / 축B 코드품질 7항목 / 축C 성능 7항목)
**감사 대상 커밋**: `506ab37` (branch `develop`, working tree clean, v0.6.0)
**감사일**: 2026-07-26
**감사 성격**: 개발 이력·이슈·PR 맥락을 참조하지 않고 현재 코드 상태만으로 수행한 독립 감사 (ISO 9001 9.2 독립성 원칙)
**판정 척도**: Pass(기준 충족) / Partial(부분 충족, 개선권고) / Fail(미충족, 시정조치 필수)

---

## 0. 감사 방법론 및 증거 수집 방식

정성적 인상이 아니라 실행 가능한 증거로 판정한다(TQM 데이터 기반 의사결정 원칙).

| 방법 | 적용 대상 | 비고 |
|---|---|---|
| 전체 소스 정독 | `src/**` 21개 파일, `client/src/**` 17개 파일, `migrations/**` 4개, `test/**` 9개 | 총 유효 코드 5,222줄 |
| 동적 검증(격리 DB) | 서버를 임시 `DB_PATH`로 기동해 실제 HTTP 요청 발사 | 프로젝트 데이터(`data/finance.db`)는 일절 접근하지 않음 |
| 부하 측정 | 20,000건 / 200,000건 시드 후 엔드포인트별 30회 측정 p50/p95 | 로컬 루프백, 결정론적 시드 |
| SQL 실행계획 | `EXPLAIN QUERY PLAN` 직접 실행 | 인덱스 사용 여부 확증 |
| 정적 지표 | 중복률·순환복잡도·순환의존성 자체 스크립트 측정 | 측정 방법 각 항목에 명시 |
| 커버리지 | `node --test --experimental-test-coverage` | |
| 의존성 | `npm audit` (root/client 각각) | |

**감사 중 코드는 일절 수정하지 않았다.** 검증용 스크립트/DB는 전부 세션 스크래치 영역에 생성 후 삭제했다.

---

## 1. 요약

### 1.1 전체 판정 통계

| 축 | Pass | Partial | Fail | 합계 |
|---|---:|---:|---:|---:|
| A — 보안 | 2 | 4 | 1 | 7 |
| B — 코드품질 | 0 | 3 | 4 | 7 |
| C — 성능 | 2 | 3 | 2 | 7 |
| **합계** | **4 (19.0%)** | **10 (47.6%)** | **7 (33.3%)** | **21** |

Kaizen 관점의 핵심 지표인 **Pass 비율은 19.0%**다. 이번이 사이클 1이므로 추이 비교 대상은 없으며, 이 값이 다음 사이클의 기준선(baseline)이 된다.

### 1.2 가장 심각한 결함 Top 5

| # | ID | 결함 | 심각도 | 근거 표준 |
|---|---|---|---|---|
| 1 | FND-01 | **CSRF로 전체 거래내역 원격 삭제 가능** — 악성 웹페이지의 HTML `<form>` 하나로 `POST /api/data/import`가 `mode=overwrite`로 실행돼 거래 전건이 삭제됨. 실제 재현 완료 | **Critical** | CWE-352(2025 CWE Top25 3위), OWASP Top10:2025 A01 |
| 2 | FND-02 | **거래내역 화면이 최신 500건만 보고 집계** — 클라이언트는 `limit=5000`을 요청하지만 서버가 500으로 클램프. 검색·필터·월별 수입/지출 합계가 조용히 틀림 | **High** | ISO 25010 기능적합성(정확성), OWASP A10 |
| 3 | FND-03 | **설정 복원 기능이 항상 실패** — `POST /api/export/settings/restore`가 거래 1건만 있어도 FK 제약 위반으로 100% 실패. 실제 재현 완료 | **High** | ISO 25010 신뢰성, OWASP A10 |
| 4 | FND-04 | **500 응답에 전체 스택트레이스·절대경로 노출 + 보안 헤더 전무** — 전역 에러 미들웨어 부재, try/catch 누락 6곳. 실제 재현 완료 | **High** | CWE-209, OWASP Top10:2025 A02, ASVS V14 |
| 5 | FND-05 | **할부 청구액을 두 엔드포인트가 다르게 계산** — 동일 DB에서 `/api/installments`는 200,000원, 대시보드는 100,000원. 같은 응답 안에서 `remaining_months=0`인 건을 합계에 포함. 실제 재현 완료 | **High** | ISO 25010 기능적합성(정확성), 일관성 |

### 1.3 총평

- **아키텍처 결정과 문서화 품질은 이 규모 프로젝트로서 상위권이다.** ADR 0003/0004(xlsx 벤더링)는 실측 501건 필드 단위 회귀 비교, 대체 라이브러리 13개 샘플 파싱 실증, integrity 해시 교차검증까지 포함한 근거 기반 의사결정으로 CMMI Level 3 수준의 결정 기록에 해당한다. `docs/decisions/`, PR 템플릿, Conventional Commits CI 게이트, release-please 파이프라인 모두 갖춰져 있다.
- **그러나 "단일 사용자 로컬 앱이므로 인증이 불필요하다"는 전제가 실제 위협 모델을 과소평가하고 있다.** 루프백 바인딩은 *다른 기기*로부터의 접근은 막지만, *같은 기기의 브라우저*가 방문하는 임의 웹사이트로부터의 접근은 막지 못한다. FND-01은 이 간극을 실증한 결과다.
- **가장 큰 구조적 약점은 검증 체계다.** 라우트 18개 마운트 중 11개가 HTTP 테스트 전무이고, 테스트가 자식 프로세스로 서버를 띄우는 구조라 라우트 코드는 커버리지 계측 자체가 안 된다. CI의 문법 검사 게이트는 `find -exec` 특성상 실패해도 빌드를 통과시킨다(FND-16). 즉 **Jidoka(이상 시 자동 정지)가 작동하지 않는 상태**다.
- **성능은 현재 규모에서 문제없다.** 20만 건 부하에서도 전 엔드포인트 p95가 기준 이내다(C4/C5 Pass). 다만 비-sargable 쿼리와 N+1 때문에 지연이 행 수에 선형 비례하므로(2만→20만 건에서 10배 증가) 잠재 리스크로 기록한다.

---

## 2. 축 A — 보안 (Security) 상세 판정

| # | 체크 항목 | 판정 | 근거 요약 |
|---|---|---|---|
| A1 | 접근통제: 타 사용자 데이터 접근 차단(IDOR) | **Partial** | 단일 사용자 설계로 IDOR 자체는 성립하지 않고 루프백 바인딩이 문서화된 보완통제로 존재. 그러나 **CSRF 방어가 전무해 브라우저 경유 접근이 열려 있음(FND-01, Critical)**. 통과 기준 "모든 리소스 엔드포인트가 소유자 검증 미들웨어를 거침"은 미충족 |
| A2 | 인젝션 방지: SQLite 파라미터 바인딩 | **Pass** | 전 라우트 검사 결과 사용자 입력이 SQL 문자열에 직접 결합되는 지점 **0건**. 동적 WHERE 절은 고정 문자열 조각만 이어붙이고 값은 전부 `?` 바인딩. `IN (...)`도 생성된 플레이스홀더 사용(`transactions.js:271-272`). LIKE는 `escapeLike()` + `ESCAPE '\'` 적용(`transactions.js:562-563`) |
| A3 | XSS 방지: 출력 이스케이핑 | **Pass** | `dangerouslySetInnerHTML`·`innerHTML`·`eval`·`new Function` 사용 **0건**. `react-markdown`은 `rehype-raw` 미사용(기본값에서 raw HTML 비활성)이며 렌더 대상은 서버 파일(`docs/GUIDE.md`)로 사용자 입력이 아님 |
| A4 | 인증: 비밀번호 해싱·세션 관리 | **Partial** | 인증 계층 자체가 없음. `docs/ARCHITECTURE.md:61-80`에 «네트워크 바인딩 및 인증 정책»으로 명시적 설계 결정 기록. 단, `IMPLEMENTATION_AUDIT.md:62`가 "사용자 로그인 및 계정 시스템 필요"를 미결로 유지 중이며, 통과 기준(bcrypt/argon2, HttpOnly+Secure+SameSite)은 어느 것도 충족하지 않음 |
| A5 | 설정 보안: 보안헤더/CORS/디버그모드 | **Fail** | Helmet 미적용, 보안 헤더 **0개**(CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy 전무), `X-Powered-By: Express` 노출, CORS 정책 부재, `NODE_ENV` 미설정으로 Express 기본 에러 핸들러가 스택트레이스를 HTML로 반환(FND-04) |
| A6 | 민감데이터 보호: 전송/저장 암호화 | **Partial** | 시크릿 위생은 양호 — `.env` 미커밋(git 이력 전체 검사), 하드코딩 크레덴셜 0건, `src/utils/http.js:5-15`가 외부 API 키를 에러 메시지에서 마스킹. 단 HTTPS 미강제(평문 HTTP), SQLite 파일 평문 저장 |
| A7 | 의존성 공급망 | **Partial** | `npm audit` root/client 모두 `found 0 vulnerabilities`. xlsx는 ADR 0004로 벤더링 결정이 근거와 함께 기록되고 integrity 해시가 CDN 원본과 일치함이 교차검증됨. **단 `file:` 의존성은 npm audit/Dependabot의 어드바이저리 매칭 대상이 아니므로 "0건"이 향후 취약점을 탐지한다는 보장이 되지 않으며**, `.github/dependabot.yml` 부재 + CI에 `npm audit` 단계 없음 |

**축 A 소계**: Pass 2 / Partial 4 / Fail 1

---

## 3. 축 B — 코드품질 (Code Quality) 상세 판정

| # | 체크 항목 | 통과 기준 | 실측 | 판정 |
|---|---|---|---|---|
| B1 | 테스트 커버리지(신규 코드) | ≥ 80% | **계측된 파일 4개 한정 78.11%**, 라우트/클라이언트 0% 계측 | **Fail** |
| B2 | 코드 중복률 | ≤ 3% | **8.48%** | **Fail** |
| B3 | 복잡도 | 함수당 Cyclomatic ≤ 10 | **218개 중 37개(17.0%) 초과**, 최대 43 | **Fail** |
| B4 | 리뷰 프로세스 준수 | PR 크기 중앙값 <400줄, 응답 1영업일 | 커밋 중앙값 **71줄**(양호), 그러나 **전 커밋 단일 작성자** | **Partial** |
| B5 | 계층 분리/유지보수성 | 라우트-컨트롤러-모델 분리, 순환의존 0건 | 순환의존 **0건**(양호), 그러나 라우트가 SQL·비즈니스로직 직접 보유 | **Partial** |
| B6 | 트랜잭션/에러처리 | DB 트랜잭션 적용, 에러 바운더리/미들웨어 존재 | 트랜잭션은 적절, **전역 에러 미들웨어·React 에러 바운더리 둘 다 부재** | **Fail** |
| B7 | 프로세스 문서/추적성 | 요구사항-커밋-테스트 추적 가능 | ADR·템플릿·CI 게이트 양호, **핵심 문서 3종이 현재 코드와 불일치** | **Partial** |

### B1 상세 — 커버리지

`node --test --experimental-test-coverage` 실행 결과 계측 대상이 4개 파일뿐이다:

```
   cardExcelImport.js |  67.35 |    74.19 |   81.82
   csvImport.js       |  88.66 |    73.47 |  100.00
   date.js            | 100.00 |   100.00 |  100.00
   errors.js          | 100.00 |    85.71 |  100.00
   all files          |  78.11 |    75.00 |   90.00
```

라우트 코드가 0%로 나오는 게 아니라 **목록에 아예 없다**. 원인은 테스트 하네스 구조다 — `test/validation.test.js:17-22` 등이 `spawn('node', ['src/server.js'])`로 별도 프로세스를 띄우므로 부모 프로세스의 커버리지 계측이 자식에 미치지 않는다. 즉 `src/routes/**` 1,900여 줄은 **커버리지가 낮은 게 아니라 측정 자체가 안 되고 있다.**

HTTP 테스트가 존재하는 라우트 마운트는 18개 중 7개다:

| 테스트 있음 (7) | 테스트 없음 (11) |
|---|---|
| transactions, categories, installments, csv-import, data, recurring-rules, health | **card-import, cashflow, debts, exchange, export, guide, payment-methods, revolving, savings, settings, stocks** |

`export`(백업/복원)와 `settings`가 무테스트인 점이 FND-03이 발견되지 못한 직접 원인이다. 전체 39개 테스트는 모두 통과한다(`pass 39 / fail 0`).

### B2 상세 — 중복률 8.48%

측정 방법: 주석·빈줄·import·단독 닫는괄호 제외한 유효 라인 5,222줄 대상, 6줄 이상 정확 일치 블록을 중복으로 계수(SonarQube의 토큰 기반 방식보다 보수적).

| 파일 | 중복 라인 / 유효 라인 | 비율 |
|---|---|---|
| `src/routes/cashflow.js` | 41 / 74 | **55%** |
| `client/src/pages/Settings.jsx` | 149 / 863 | 17% |
| `client/src/pages/Savings.jsx` | 28 / 167 | 17% |
| `client/src/pages/Debts.jsx` | 46 / 298 | 15% |
| `client/src/pages/Installments.jsx` | 31 / 214 | 14% |

대표 중복 쌍:
- `src/routes/transactions.js:359-402` ↔ `src/routes/cashflow.js:7-50` — `pad2`/`lastNDates`/`mondayOf`/`lastNWeeks`/`lastNMonths` 5개 함수가 글자 단위로 동일
- 수입/지출 집계 SQL 조각(`CASE WHEN c.major_type = '수입' ...`)이 `transactions.js` 5곳 + `cashflow.js:59-65`에 반복 — **비즈니스 규칙(할부·리볼빙 제외)이 6곳에 흩어져 있어 규칙 변경 시 누락 위험**
- `getOrCreateUncategorized` 로직이 `csvImport.js:20-28` ↔ `cardImport.js:71-82` 중복
- 중복 판정 쿼리가 `cardImport.js:46-48` ↔ `cardImport.js:92-94` 동일 파일 내 중복

### B3 상세 — 복잡도

측정 방법: 결정점(`if`/`for`/`while`/`case`/`catch`/`&&`/`||`/`??`/삼항) 계수 + 1의 근사치. JSX의 `&&` 조건부 렌더가 포함되므로 **프론트엔드 수치는 과대평가 경향이 있다**(정확도 중간). 백엔드 수치는 신뢰도가 높다.

| CC | 줄수 | 위치 |
|---:|---:|---|
| 43 | 111 | `src/routes/data.js:53` `POST /import` |
| 32 | 113 | `src/routes/cardImport.js:13` `processTransactions` |
| 20 | 125 | `src/routes/transactions.js:405` `GET /summary/dashboard` |
| 20 | 36 | `src/routes/savings.js:73` `POST /:id/mature` |
| 18 | 30 | `src/routes/debts.js:67` `POST /:id/interest` |
| 18 | 21 | `src/routes/installments.js:46` `POST /` |
| 17 | 50 | `src/services/cardExcelImport.js:97` `parseSamsungExcel` |

`data.js:53`은 111줄 단일 핸들러 안에 입력검증·카테고리 폴백·레거시 필드 판정·FK 폴백·트랜잭션 실행이 전부 들어 있다. SonarQube Cognitive Complexity 임계값 15와 관행적 Cyclomatic 상한 10을 크게 초과한다.

### B4 상세 — 리뷰 프로세스

| 지표 | 값 | 판정 |
|---|---|---|
| 비-머지 커밋 변경 규모 중앙값(최근 39개) | **71줄** | Google/MS 권고(100줄 내외, 400줄 미만) 충족 |
| 400줄 초과 커밋 | 3 / 39 | 양호 |
| Conventional Commits 강제 | `.github/workflows/pr-title-check.yml` CI 게이트 | 충족 |
| PR 템플릿 / CODEOWNERS | 존재 (`* @VinylStage`) | 형식 충족 |
| **커밋 작성자** | 최근 200 커밋 중 **194개가 단일 이메일**(나머지 6개는 github-actions bot) | **미충족** |

CODEOWNERS가 지정한 리뷰어가 곧 유일한 작성자다. 즉 **모든 PR이 자기 코드에 대한 자기 승인**으로 병합되고 있으며, ISO 9001 9.2의 "감사자는 자신의 업무를 감사하지 않는다" 원칙과 Google/MS가 전제하는 리뷰어 독립성이 구조적으로 성립하지 않는다. 1인 프로젝트의 불가피한 제약이지만, 그렇다면 **사람 리뷰가 제공하지 못하는 검증을 자동 게이트가 대신 제공해야 한다** — 그런데 그 자동 게이트가 FND-16처럼 무력화돼 있는 것이 문제의 핵심이다.

### B5 상세 — 계층 분리

- 순환 의존성 **0건**(`src/**` require 그래프 전수 검사) — 양호
- `src/utils/`, `src/services/`, `src/db/`로의 공통 로직 추출은 적절히 이루어짐
- 그러나 **컨트롤러/모델 계층이 없다.** 라우트 핸들러가 `db.prepare(...)`를 직접 호출하며 비즈니스 규칙(할부/리볼빙 제외, 잔액 계산, 만기 정산)을 그 자리에서 수행한다. B2의 SQL 조각 6중 중복이 이 구조의 직접적 결과다.
- `client/src/pages/Settings.jsx` — **1,020줄 단일 파일에 11개 컴포넌트, useState 38개.** 파일 단위 관심사 분리 위반

### B7 상세 — 문서 추적성

ADR 4건, PR 템플릿, 이슈 템플릿 3종, 다이어그램 5종, CHANGELOG 자동생성 — 형식적 산출물은 충실하다. 커밋 100개 중 62개가 `#NN` 이슈 번호를 참조해 추적성도 확보돼 있다. 문제는 **문서 내용이 코드와 어긋난 채 방치돼 있다**는 점이다(FND-17).

**축 B 소계**: Pass 0 / Partial 3 / Fail 4

---

## 4. 축 C — 성능 (Performance) 상세 판정

| # | 체크 항목 | 통과 기준 | 실측 | 판정 |
|---|---|---|---|---|
| C1 | LCP | p75 < 2.5s | **측정 불가** — RUM 계측 부재 | **Partial** |
| C2 | INP | p75 < 200ms | **측정 불가** — RUM 계측 부재 | **Partial** |
| C3 | CLS | p75 < 0.1 | **측정 불가** — RUM 계측 부재 | **Partial** |
| C4 | API 응답시간(단순 CRUD) | p95 < 300ms | 20만 건에서 **최대 3.5ms** | **Pass** |
| C5 | API 응답시간(집계/리포트) | p95 < 800~1000ms | 20만 건에서 **최대 310ms** | **Pass** |
| C6 | DB 쿼리 효율 | N+1 0건, 주요 조회 인덱스 존재 | **N+1 잔존, 비-sargable 쿼리, 인덱스 누락** | **Fail** |
| C7 | 프론트엔드 번들/렌더링 | 코드 스플리팅 적용 | **단일 808KB 청크, 스플리팅 0** | **Fail** |

### C1~C3 상세 — Core Web Vitals 측정 불가

제품에 `web-vitals` 등 RUM 계측이 전혀 없고, 감사 환경의 브라우저 페인에서 뷰포트가 `0x0`으로 보고돼 페인트 기반 지표(FCP/LCP)가 발생하지 않았다(CLS는 그 상태에서 자명하게 0이므로 유효 측정으로 볼 수 없다). 따라서 통과 기준인 **"p75 RUM"을 판정할 근거 자체가 존재하지 않는다.**

Fail이 아닌 Partial로 판정한 이유: 기준 미달이 확인된 게 아니라 **측정 체계 부재로 검증 불가**한 상태이며, 이는 결함이라기보다 검증 공백이다. 다만 ISO 9001·TQM의 데이터 기반 관리 관점에서 측정 체계 부재 자체가 개선 대상이다.

참고로 확보한 실험실 지표(루프백, 캐시 없음): 초기 로드 리소스는 `index.js` 828,139 bytes(gzip 222KB) + `index.css` 22,846 bytes(gzip 5KB), 문서 로드 완료 22~87ms. 루프백에서는 LCP 임계값 위험이 낮으나, 이는 네트워크 지연이 0에 수렴하는 특수 조건이며 C7의 번들 문제를 상쇄하지 않는다.

구조적 CLS 리스크: 각 페이지가 `loading ? '로딩 중...' : <content>` 패턴으로 공간 예약 없이 교체되고(`Transactions.jsx:277-283`, `Dashboard.jsx` 등) 차트가 데이터 도착 후 마운트되므로 레이아웃 시프트가 발생할 개연성이 있다. 수치 없이 단정하지 않고 다음 사이클 측정 항목으로 넘긴다.

### C4~C5 상세 — API 응답시간 실측

동일 코드, 격리 DB, 엔드포인트당 워밍업 3회 후 30회 측정(단위 ms).

| 엔드포인트 | 2만 건 p95 | 20만 건 p95 | 기준 | 판정 |
|---|---:|---:|---|---|
| `GET /api/transactions?limit=100` | 2.2 | 3.3 | <300 | Pass |
| `GET /api/transactions?limit=500` | 3.1 | 3.5 | <300 | Pass |
| `GET /api/transactions/:id` | 1.7 | 1.7 | <300 | Pass |
| `GET /api/categories` | 1.7 | 1.7 | <300 | Pass |
| `GET /api/installments` | 1.9 | 1.9 | <300 | Pass |
| `GET /api/transactions/summary/dashboard` | 17.1 | **171.1** | <800 | Pass |
| `GET /api/cashflow?granularity=monthly` | 25.6 | **247.5** | <800 | Pass |
| `GET /api/transactions/period-comparison?period=yearly` | 14.9 | **166.5** | <800 | Pass |
| `GET /api/transactions/suggest/merchants` | 6.1 | **50.6** | <300 | Pass |
| `GET /api/export/csv` | 26.1 | **261.5** | <800 | Pass |
| `GET /api/data/export` | 29.6 | **310.0** | <800 | Pass |

전 항목 기준 충족. 다만 **행 수 10배 증가 시 집계 계열 지연이 정확히 약 10배로 선형 증가**한다(dashboard 17.1→171.1, cashflow 25.6→247.5). 이는 인덱스가 아니라 풀스캔이 지배하고 있다는 신호이며 C6의 근거가 된다. 개인 가계부의 현실적 데이터 규모(연 수천 건)에서는 문제되지 않으므로 C4/C5는 Pass로 판정하되, 잠재 리스크로 기록한다.

**축 C 소계**: Pass 2 / Partial 3 / Fail 2

---

## 5. 발견사항 상세

심각도 기준 — **Critical**: 데이터 손실/원격 악용 가능. **High**: 기능이 조용히 틀리거나 동작하지 않음, 또는 내부정보 노출. **Medium**: 특정 조건에서 오동작하거나 유지보수/검증 체계 결함. **Low**: 개선 권고.

---

### FND-01 · Critical · CSRF로 전체 거래내역 원격 삭제

**위치**: `src/server.js:8-9`(전역 파서), `src/routes/data.js:53-69`
**표준**: CWE-352(2025 CWE Top25 3위), OWASP Top10:2025 A01 Broken Access Control, ASVS V4

CSRF 토큰·Origin 검증·Referer 검증·SameSite 쿠키가 전부 없다. 인증이 없으므로 세션 탈취도 필요 없다 — 요청이 도달하기만 하면 실행된다.

`src/server.js:9`가 `express.urlencoded({ extended: false })`를 전역 마운트하므로, **JavaScript 없이 HTML `<form>` 만으로 만들 수 있는 CORS "simple request"**(프리플라이트 없음)가 API에 그대로 도달한다. `extended: false`의 querystring 파서는 같은 이름 필드를 배열로 만들어주므로 `data.js:62`의 `Array.isArray(transactions)` 검사를 통과한다.

**실제 재현 (감사 중 실행, 격리 DB)**:

```
공격 전 거래 건수: 5

POST /api/data/import
Content-Type: application/x-www-form-urlencoded
Origin: http://evil.example
mode=overwrite&confirm=DELETE_ALL&transactions=x&transactions=y

→ 200 {"ok":true,"imported":0,"skipped":2,"deleted":5,"total":2}

공격 후 거래 건수: 0
```

공격자 페이지는 다음이면 충분하다:

```html
<form method="POST" action="http://127.0.0.1:3000/api/data/import">
  <input name="mode" value="overwrite">
  <input name="confirm" value="DELETE_ALL">
  <input name="transactions" value="x">
  <input name="transactions" value="y">
</form>
<script>document.forms[0].submit()</script>
```

`confirm: 'DELETE_ALL'` 토큰(`data.js:67`)은 **사용자 의도 확인이 아니라 상수 문자열**이므로 공격자도 그대로 포함시킬 수 있어 방어 효과가 없다.

`docs/ARCHITECTURE.md:63`은 "API에 도달할 수 있는 범위를 네트워크 바인딩으로 제한하는 것이 유일한 접근 통제 수단"이라고 기술하지만, **루프백 바인딩은 같은 기기의 브라우저를 신뢰 경계 안에 포함시킨다.** 사용자가 앱을 켜 둔 채 아무 웹사이트나 방문하면 성립하므로, 이 문서의 위협 모델에는 브라우저 경유 경로가 누락돼 있다.

동일 경로로 `POST /api/transactions`(허위 거래 삽입, 201 응답 재현 완료), `POST /api/categories`, `POST /api/debts` 등도 악용 가능하다.

---

### FND-02 · High · 거래내역 화면이 최신 500건만 보고 집계·검색

**위치**: `client/src/pages/Transactions.jsx:35` ↔ `src/routes/transactions.js:14`

```js
// client/src/pages/Transactions.jsx:35
api.get('/api/transactions?limit=5000'),
```

```js
// src/routes/transactions.js:14
const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
```

클라이언트는 5,000건을 요청하지만 **서버가 500건으로 클램프하고, 잘렸다는 사실을 응답에 표시하지 않는다**(`total`은 전체 건수를 정확히 반환하지만 클라이언트가 사용하지 않는다). 결과:

1. **검색·필터가 최신 500건 안에서만 동작한다.** `Transactions.jsx:56-65` `matchesFilters`는 순수 클라이언트 필터다. 커밋 `029c737`("거래내역 검색·필터 고도화 — 가맹점/금액범위/결제수단/메모/다중카테고리")는 `client/src/pages/Transactions.jsx` 단일 파일 99줄 추가로만 구성돼 있고 **서버 측 필터 파라미터가 추가되지 않았다.** 501번째 이후 거래는 어떤 검색어로도 나오지 않으며 "결과 없음"으로 표시된다.
2. **월별 수입/지출 합계가 틀린다.** `Transactions.jsx:87-92`가 잘린 배열로 `g.income`/`g.expense`를 누적하므로, 500건을 넘긴 시점부터 과거 월의 합계가 실제보다 작게 표시된다. 금전 데이터에서 조용히 틀린 숫자를 보여주는 것은 오류 메시지보다 위험하다.
3. **연도 탭이 누락된다.** `Transactions.jsx:44-47`의 `years`도 잘린 배열에서 추출되므로 오래된 연도 탭 자체가 사라진다.

한계 도달 시점: 카드 임포트를 쓰는 사용자 기준 수개월이면 500건에 도달한다. `docs/ROADMAP.md`의 "거래 내역 페이징 로딩 개선"이 미완인 상태에서 클라이언트 필터가 추가되면서 결함이 표면화된 형태다.

---

### FND-03 · High · 설정 복원 기능이 항상 실패

**위치**: `src/routes/export.js:116-135`, `src/routes/export.js:149-161`

```js
// src/routes/export.js:118-122
if (payload.categories) {
  db.prepare('DELETE FROM categories').run();
  const ins = db.prepare('INSERT INTO categories (id, major_type, name, monthly_budget, is_active) VALUES (...)');
  payload.categories.forEach(r => ins.run(r));
}
```

`src/db/init.js:13`이 `PRAGMA foreign_keys = ON`을 설정하고, `init.js:36`의 `transactions.category_id`가 `REFERENCES categories(id)`(ON DELETE 절 없음 = NO ACTION)이다. 따라서 **거래가 1건이라도 있으면 `DELETE FROM categories`가 즉시 FK 제약 위반으로 실패**하고 트랜잭션 전체가 롤백된다.

**실제 재현 (감사 중 실행, 격리 DB)**:

```
tx count: 1
RESULT: restoreSettings 실패 -> FOREIGN KEY constraint failed
```

즉 **거래가 없는 빈 DB에서만 성공하는 복원 기능**이다. 사용자에게는 `serverError`를 거쳐 `{"error":"Internal server error"}` 500만 전달되므로(`export.js:158-159`) 원인을 알 수 없다.

부가 결함 2건:
- `POST /api/export/settings/restore`는 **카테고리·결제수단·설정 전체를 삭제하는 파괴적 동작인데 확인 토큰이 없다.** `data.js:67`의 `confirm: 'DELETE_ALL'` 요구와 정책이 어긋난다(같은 파괴 등급, 다른 안전장치).
- `export.js:149`가 라우트 단위로 `express.json({ limit: '10mb' })`를 다시 마운트하지만, `server.js:6-8`의 주석이 명시하듯 전역 파서가 먼저 실행되므로 이 설정은 무효다. 죽은 코드.

이 결함이 릴리스까지 살아남은 직접 원인은 B1이다 — `export` 라우트에 HTTP 테스트가 하나도 없다.

---

### FND-04 · High · 500 응답에 전체 스택트레이스·절대경로 노출 + 보안 헤더 전무

**위치**: `src/server.js` 전체(전역 에러 미들웨어 부재), `src/routes/paymentMethods.js:32-37`, `categories.js:8-21,52-55`, `installments.js:90-93`, `revolving.js:77-80`, `savings.js:67-70`, `transactions.js:282-292`
**표준**: CWE-209 Information Exposure Through an Error Message, OWASP Top10:2025 A02 + A10, ASVS V14

`src/utils/errors.js`의 `serverError()`는 내부 메시지를 숨기도록 올바르게 설계돼 있으나, **`try/catch`가 없는 핸들러 6곳 이상은 이 경로를 타지 않는다.** Express 5는 동기 throw를 잡아 에러 미들웨어로 넘기는데, `server.js`에 에러 미들웨어가 없고 `NODE_ENV`도 설정되지 않아 **Express 기본 핸들러가 스택트레이스를 HTML로 그대로 반환한다.**

**실제 재현 (감사 중 실행)**:

```
PUT /api/payment-methods/1  {"name":{"a":1},"type":"x"}
→ 500 text/html

<pre>RangeError: Too few parameter values were provided<br>
    at /Users/vinyl/vinylstudio/finace-tracker/src/routes/paymentMethods.js:35:6<br>
    at Layer.handleRequest (/Users/.../node_modules/router/lib/layer.js:152:17)<br>
    ...
```

서버 절대경로·의존성 내부 구조·정확한 실패 라인이 노출된다.

보안 헤더 실측(`GET /api/health` 응답 전체):

```
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
ETag: ...
```

`Content-Security-Policy`·`X-Content-Type-Options`·`X-Frame-Options`·`Referrer-Policy`·`Strict-Transport-Security` 전무. `X-Powered-By`로 스택 노출. Helmet 미도입.

**함께 확인한 오탐 정정**: 경로 조작(`/../package.json`, `/%2e%2e/package.json`, `/..%2fpackage.json`, `/.env`)은 전부 SPA 폴백 `index.html`을 반환하며 **실제 파일 유출은 없다.** 경로 조작 취약점은 존재하지 않는다.

---

### FND-05 · High · 할부 이번달 청구액을 두 엔드포인트가 다르게 계산

**위치**: `src/routes/installments.js:33-37` vs `src/routes/transactions.js:426-432`

```sql
-- installments.js:34-37 — 청구 종료 시점을 보지 않는다
SELECT COALESCE(SUM(monthly_amount), 0) AS total FROM installments
WHERE status = '진행중' AND start_billing_month <= ?
```

```sql
-- transactions.js:427-432 — 청구 기간 종료를 정확히 반영한다
SELECT COALESCE(SUM(monthly_amount),0) AS total FROM installments
WHERE status = '진행중' AND start_billing_month <= ?
  AND ? < strftime('%Y-%m', date(start_billing_month || '-01', '+' || months || ' months'))
```

**실제 재현 (감사 중 실행, 격리 DB)** — 이미 종료됐지만 `status='진행중'`으로 남은 할부 1건 + 실제 진행 중 1건:

```
=== /api/installments ===
this_month_total = 200000
   진행중할부  start=2026-04 months=12 remaining=8 status=진행중
   종료된할부  start=2025-01 months=6  remaining=0 status=진행중

=== /api/transactions/summary/dashboard ===
installmentsDue = 100000
```

같은 DB 상태에서 화면마다 **200,000원과 100,000원**이 표시된다. 더 심각한 것은 `/api/installments` 응답의 **자기모순**이다 — 같은 응답 안에서 `remaining_months = 0`(청구 끝남)이라고 밝힌 항목의 `monthly_amount`를 `this_month_total`에 합산하고 있다. 대시보드의 `available`(가용 현금) 계산이 `installmentsDue`를 차감하므로(`transactions.js:522`) 어느 쪽 숫자를 믿느냐에 따라 가용 현금 판단이 달라진다.

근본 원인은 B2/B5 — 동일한 비즈니스 규칙이 서로 다른 두 SQL로 중복 구현돼 한쪽만 수정됐다.

---

### FND-06 · Medium · 숫자 검증 없는 산술로 잔액이 오염될 수 있음

**위치**: `src/routes/revolving.js:39`, `src/routes/revolving.js:59`, `src/routes/debts.js:78`

```js
// revolving.js:35-39 — req.body 값을 타입 검증 없이 그대로 산술에 사용
const { month, payment_method_id, carried_balance = 0, new_charge = 0, paid_amount, interest = 0 } = req.body;
if (!month || !payment_method_id || paid_amount === undefined) { ... }
const next_carried_balance = carried_balance + new_charge - paid_amount + interest;
```

존재 여부만 검사하고 **숫자인지 검사하지 않는다.** JSON 본문으로 문자열이 오면 `+`가 문자열 연결로 동작한다 — `"100" + "200"` → `"100200"`, 이후 `- paid_amount`가 숫자로 강제되어 **10만 원 단위 오차가 잔액에 저장된다.** SQLite INTEGER 컬럼의 타입 친화성 때문에 저장 단계에서도 걸리지 않는다.

`revolving.js:54-59`의 PUT은 더 취약하다 — `{...existing, ...req.body}`로 DB의 정수와 본문의 문자열이 섞인 채 같은 산술을 수행한다.

`debts.js:77-78`도 동일하다:
```js
const balance_after = balance_before + interest_amount;  // interest_amount 타입 미검증
```

`src/utils/validate.js`에 `asInt()`가 이미 존재하고 `transactions.js`·`recurringRules.js`는 이를 사용한다. **검증 유틸이 있는데 금액을 다루는 3개 라우트가 쓰지 않는 것**이 문제다(Poka-yoke 미적용).

`src/routes/data.js:99-144`의 임포트 경로도 `tx.date` 형식·`tx.amount` 타입을 검증하지 않아 백업 파일을 통해 동일한 오염이 유입될 수 있다.

---

### FND-07 · Medium · cashflow 라우트의 N+1 쿼리

**위치**: `src/routes/cashflow.js:73-85`

```js
if (granularity === 'daily') {
  const stmt = db.prepare(`${FLOW_SELECT} WHERE t.date = ?`);
  periods = lastNDates(30).map(date => ({ period: date, ...stmt.get(date) }));   // 쿼리 30회
} else if (granularity === 'weekly') {
  ... lastNWeeks(12).map(...)                                                     // 쿼리 12회
} else if (granularity === 'yearly') {
  ... lastNYears(5).map(...)                                                      // 쿼리 5회
} else {
  ... lastNMonths(12).map(...)                                                    // 쿼리 12회
}
```

`transactions.js:478-505`는 동일한 패턴을 이미 제거했고 코드에 "N+1 제거" 주석까지 남아 있으나, **`cashflow.js`는 수정 대상에서 누락됐다.** 통과 기준 "N+1 패턴 0건" 미충족.

실측 영향(20만 건): `granularity=monthly` p95 **247.5ms** — 12회 반복 실행이 지배적이다.

---

### FND-08 · Medium · 비-sargable 쿼리로 인한 풀스캔 + 인덱스 누락

**위치**: `src/routes/transactions.js:414,421,431,444,453,493,498,512`, `src/routes/cashflow.js:80,83`, `src/db/init.js:47-49,51-62`

집계 쿼리 대부분이 `strftime('%Y-%m', t.date) = ?` 형태로 **인덱스 컬럼을 함수로 감싸고 있어** `idx_tx_date`(`init.js:47`)를 사용할 수 없다.

**`EXPLAIN QUERY PLAN` 실행 결과**:

```
--- 월별 트렌드 GROUP BY strftime ---
   SCAN t                                       ← transactions 풀스캔
   SEARCH c USING INTEGER PRIMARY KEY (rowid=?)
   USE TEMP B-TREE FOR GROUP BY

--- 할부 이번달 합계 (installments) ---
   SCAN installments                            ← 인덱스 자체가 없음
```

`installments` 테이블에는 **인덱스가 하나도 없다**(`init.js:51-62`). `status`/`start_billing_month`로 필터하는 쿼리가 대시보드와 목록 양쪽에서 호출된다.

`t.date >= ? AND t.date < ?` 범위 조건으로 바꾸면 동일 결과를 인덱스로 처리할 수 있다(`transactions.js:52-74`의 `rangeTotalsByDate`는 이미 이 방식이다 — 같은 파일 안에 올바른 패턴과 잘못된 패턴이 공존).

현재 데이터 규모에서 기준 위반은 아니지만(C4/C5 Pass), 지연이 행 수에 선형 비례하는 원인이다.

---

### FND-09 · Medium · 업로드 파일 크기 무제한 (메모리 저장)

**위치**: `src/routes/cardImport.js:10,163`

```js
const upload = multer({ storage: multer.memoryStorage() });   // limits 미지정
...
router.post('/', upload.array('files', 30), async (req, res) => {
```

파일 개수만 30개로 제한하고 **크기 제한(`limits.fileSize`)이 없다.** `memoryStorage`이므로 업로드 전량이 힙에 적재된다. 파일 형식 필터(`fileFilter`)도 없어 임의 바이너리가 `XLSX.read`로 전달된다. JSON 본문은 `server.js:8`에서 10MB로 제한하면서 multipart 경로만 무제한인 비대칭 상태다. FND-01의 CSRF 경로(multipart form은 simple request)와 결합하면 원격 트리거도 가능하다.

---

### FND-10 · Medium · 존재하지 않는 API 경로가 200 + HTML을 반환

**위치**: `src/server.js:36-44`

SPA 폴백이 `/api/*`를 예외 처리하지 않아, 잘못된 API 경로가 **404 JSON이 아니라 200 + `index.html`** 을 반환한다.

**실제 재현**:
```
GET /api/does-not-exist            → 200  Content-Type: text/html
GET /api/transactions/summary/nope → 200  Content-Type: text/html
```

`client/src/lib/api.js:48-52`는 `res.ok`가 참이면 성공으로 간주하고 `parseBody()`가 HTML을 문자열로 반환하므로, **클라이언트가 오타 난 경로를 정상 응답으로 처리한다.** 오류가 조기에 드러나지 않고 렌더 단계에서 정체불명의 형태로 나타난다.

---

### FND-11 · Medium · GET /api/settings 가 내부 오류 메시지를 노출

**위치**: `src/routes/settings.js:25-27`

```js
} catch (e) {
  res.status(500).json({ error: e.message });   // 내부 메시지 그대로 전달
}
```

같은 파일 `settings.js:50-51`의 PUT은 `serverError()`를 올바르게 사용한다. `src/utils/errors.js:3-5`가 명시한 정책("내부 메시지를 클라이언트에 노출하지 않는다")을 GET 한 곳만 위반하고 있다.

---

### FND-12 · Medium · 라우트 11개 무테스트 + 라우트 커버리지 계측 불가

**위치**: `test/**`, `package.json:12`

B1 상세 참조. 요점 3가지:
1. 18개 API 마운트 중 **11개가 HTTP 테스트 전무** — 특히 `export`(백업/복원)와 `settings`
2. 테스트가 `spawn`으로 서버를 자식 프로세스에 띄우므로(`test/validation.test.js:17`) **`src/routes/**` 커버리지 계측 자체가 불가능**
3. `package.json`의 `"test": "node --test"`에 커버리지 옵션·임계값이 없고 CI에도 커버리지 게이트가 없음

FND-03(설정 복원 100% 실패)이 릴리스까지 통과한 직접 원인이다.

---

### FND-13 · Medium · 코드 중복률 8.48% (기준 3%)

B2 상세 참조. 특히 **비즈니스 규칙 중복**이 위험하다 — "지출 = 수입 아닌 카테고리 중 할부·리볼빙 제외"가 `transactions.js` 5곳 + `cashflow.js:59-65`에 6중 복제돼 있고, FND-05가 정확히 이 유형(한쪽만 수정)의 발현이다.

---

### FND-14 · Medium · 함수 복잡도 기준 초과 (218개 중 37개)

B3 상세 참조. 최상위 `src/routes/data.js:53` `POST /import`는 111줄·추정 CC 43으로 SonarQube Cognitive 임계값 15와 Cyclomatic 상한 10을 크게 초과한다.

---

### FND-15 · Medium · 전역 에러 미들웨어 및 React 에러 바운더리 부재

**위치**: `src/server.js`, `client/src/main.jsx`

- 백엔드: `(err, req, res, next)` 시그니처 미들웨어 **0건** → FND-04의 스택 노출 원인
- 프론트엔드: `componentDidCatch`/`getDerivedStateFromError`/`ErrorBoundary` **0건** → 하위 컴포넌트의 렌더 예외가 앱 전체를 백지로 만든다

B6 통과 기준 "에러 바운더리/미들웨어 존재"를 양쪽 다 미충족. 개별 페이지의 로드 실패 처리(`useLoader` + `LoadError`)는 잘 설계돼 있으나, 이는 렌더 예외를 잡지 못한다.

---

### FND-16 · Medium · CI 문법 검사 게이트가 실패를 감지하지 못함

**위치**: `.github/workflows/ci.yml:20-21`

```yaml
- name: Check JS syntax
  run: find src -name '*.js' -exec node --check {} \;
```

`find -exec ... \;`는 **실행된 명령의 종료코드를 자신의 종료코드에 반영하지 않는다.** 검증 실행 결과:

```
$ find . -name '*.js' -exec false \; ; echo $?
find exit code: 0
```

즉 문법 오류가 있어도 이 스텝은 항상 성공한다. `-exec ... +`나 `xargs`, 또는 `bash -c 'for f in ...; do node --check "$f" || exit 1; done'`이어야 게이트로 기능한다.

부수적으로 CI에는 **린트 단계, 커버리지 게이트, `npm audit` 단계가 모두 없다.** `AUDIT_FRAMEWORK.md` Part 3 운영규칙 3(TPS Jidoka — 이상 시 자동 정지)이 요구하는 자동 게이트가 실질적으로 부재한 상태이며, B4(단독 작성자·자기승인 구조)와 결합해 **사람 리뷰도 자동 게이트도 없는 이중 공백**을 만든다.

---

### FND-17 · Medium · 핵심 문서 3종이 현재 코드와 불일치

**위치**: `docs/ARCHITECTURE.md:18-43`, `docs/audit/IMPLEMENTATION_AUDIT.md:5-32`, `docs/ROADMAP.md`

| 문서 | 기재 | 실제 |
|---|---|---|
| `ARCHITECTURE.md:18` | "백엔드 라우트 (10개)" | **17개 파일 / 18개 마운트** |
| `ARCHITECTURE.md:30` | "프론트엔드 페이지 (9개)" | **10개** (`Guide.jsx` 누락) |
| `IMPLEMENTATION_AUDIT.md:19` | "백엔드 라우트 (10개)" | 동일 오류 (최종 확인일 2026-07-23) |
| `ROADMAP.md` API 목록 | 14개 엔드포인트 | `recurring-rules`, `csv-import`, `card-import`, `export`, `data`, `exchange`, `stocks`, `guide` **8개 그룹 누락** |

`recurringRules`(#128, 2026-07-26 추가)를 포함해 최근 기능이 어느 문서에도 반영되지 않았다. ISO 12207의 산출물 추적성 및 CMMI CM(형상관리)의 "설정 항목 상태 정확성" 요구 미충족. ADR 품질이 높은 것과 대조적으로 **상태 기술 문서만 갱신 루프에서 빠져 있다.**

---

### FND-18 · Low · KIS 라우트가 모든 오류를 503으로 마스킹

**위치**: `src/routes/stocks.js:22-26`

```js
} catch (error) {
  res.status(503).json({ error: 'KIS API integration not yet enabled' });
}
```

DB 오류든 프로그래밍 오류든 전부 "미활성화"로 보고되고 **로깅조차 되지 않는다**(`serverError` 미사용). 향후 실연동 시 장애 진단이 불가능해진다. OWASP Top10:2025 A09 Logging/Alerting Failures, A10.

---

### FND-19 · Low · 미검증 쿼리 파라미터가 응답 헤더에 반영

**위치**: `src/routes/export.js:66`, `export.js:72`

```js
res.setHeader('Content-Disposition', `attachment; filename="transactions_${from || 'all'}_${to || 'all'}.csv"`);
```

`from`/`to`가 검증 없이 헤더에 삽입된다. Node.js가 CR/LF를 포함한 헤더 값을 `ERR_INVALID_CHAR`로 거부하므로 응답 분할(CRLF Injection)은 성립하지 않으나, **따옴표 주입으로 파일명 조작이 가능하고, 제어문자 입력 시 500 오류를 유발한다.** 두 파라미터는 날짜 형식(`YYYY-MM-DD`) 검증 없이 SQL 바인딩에도 그대로 쓰인다(바인딩 자체는 안전).

---

### FND-20 · Low · 할부 경과월 계산이 UTC 기준

**위치**: `src/routes/installments.js:7-11`, `src/routes/transactions.js:468`

```js
const MONTHS_ELAPSED = `
  (CAST(strftime('%Y','now') AS INT) - ...) * 12
  + CAST(strftime('%m','now') AS INT) - ...
`;
```

SQLite의 `'now'`는 **UTC**다. KST(UTC+9)에서 매월 1일 00:00~09:00 사이에는 `strftime('%m','now')`가 전월을 반환해 `remaining_months`/`billed_months`가 1개월 어긋난다. `src/utils/date.js:3-4`가 정확히 이 문제("`toISOString()`은 UTC라서 KST에서 매일 0~9시 사이에 날짜가 하루 밀리는 문제가 있었다")를 인지하고 JS 측에서는 해결했으나, **SQL 안의 `'now'`는 같은 처리를 받지 못했다.** `transactions.js:468`의 `date('now','-29 days')`도 동일하다.

---

### FND-21 · Low · 폼 접근성 속성 부재

**위치**: `client/src/**` 전반

| 지표 | 값 |
|---|---|
| `<input>`/`<select>` 총 개수 | **79개** |
| `htmlFor` 또는 `aria-*` 속성 | **1개** (`ConfirmProvider.jsx`) |

라벨-입력 연결이 사실상 전무하며 placeholder가 라벨을 대신하고 있다(`Transactions.jsx:211-233`). 스크린리더 사용자는 필드를 식별할 수 없다. ISO 25010 사용성 특성. Part 2의 21개 항목에는 직접 대응하지 않아 판정에는 반영하지 않고 보충 발견사항으로 기록한다.

---

### FND-22 · Low · 프론트엔드 코드 스플리팅 미적용

**위치**: `client/src/App.jsx:2-11`, `client/vite.config.js`

10개 페이지를 전부 정적 import 하고 `React.lazy`/동적 `import()` 사용이 **0건**이다. 빌드 결과:

| 산출물 | raw | gzip |
|---|---:|---:|
| `index-C9Wc7dAn.js` | 808 KB | 222 KB |
| `index-CoisWYun.css` | 22 KB | 5 KB |
| **청크 수** | **2개 (단일 JS 청크)** | |

`recharts`와 `react-markdown`이 첫 로드에 전부 포함된다 — `react-markdown`은 «가이드» 탭에서만, `recharts`는 대시보드/비교 탭에서만 쓰인다. C7 통과 기준 미충족. (루프백 환경에서는 체감 영향이 작으므로 심각도는 Low로 둔다.)

---

## 6. Part 3 메타프로세스에 따른 다음 사이클 제안

`AUDIT_FRAMEWORK.md` Part 3의 PDCA 구조에 따라 정리한다. 사이클 1이므로 Check 단계의 "직전 감사 대비 비교"는 수행할 수 없고, 본 보고서가 그 기준선을 설정한다.

### 6.1 Act — 즉시수정(correction)과 근본원인 시정조치(corrective action)의 구분

ISO 9001 조항 10.2 요구에 따라 두 축을 분리해 제안한다. **개발팀의 판단 사항이며 감사팀은 권고만 한다.**

| # | 즉시수정 (correction) | 근본원인 시정조치 (corrective action) |
|---|---|---|
| FND-01 | CSRF 토큰 또는 Origin/Sec-Fetch-Site 검증 미들웨어 도입 | `docs/ARCHITECTURE.md`의 위협 모델에 **"같은 기기의 브라우저"를 신뢰 경계 밖으로 재정의**하고, "루프백 = 안전"이라는 전제를 문서 차원에서 교정. 파괴적 엔드포인트 추가 시 CSRF 검토를 PR 체크리스트 항목으로 편입 |
| FND-02 | 서버 측 필터 파라미터 추가 또는 페이지네이션 UI 도입 | **클라이언트 요청 파라미터와 서버 제약이 어긋날 때 조용히 잘리지 않도록** 응답에 `truncated` 플래그를 넣거나, `limit` 초과 요청을 400으로 거부. "화면에 보이는 합계는 전체 데이터 기준"임을 보장하는 계약 명문화 |
| FND-03 | 카테고리 복원을 DELETE+INSERT 대신 UPSERT로 변경, 파괴적 복원에 확인 토큰 요구 | 파괴적 엔드포인트의 **확인 토큰 정책 통일**(현재 `data.js`만 적용). `export`/`settings` 라우트 HTTP 테스트 추가 |
| FND-04 | Helmet 도입, 전역 에러 미들웨어 추가, `NODE_ENV=production` 문서화, try/catch 누락 6곳 보강 | **"라우트 핸들러는 반드시 표준 에러 경로를 거친다"를 린트 규칙 또는 라우터 래퍼로 강제**(Poka-yoke). 개별 핸들러의 try/catch 준수에 의존하지 않는 구조로 전환 |
| FND-05 | 두 SQL 중 정확한 쪽(대시보드)으로 통일 | **집계 규칙을 단일 모듈로 추출**해 SQL 조각 6중 중복 제거(FND-13과 동일 근본원인). 종료된 할부의 `status` 자동 전이 규칙 정의 |
| FND-06 | 3개 라우트에 기존 `asInt()`/`asNumber()` 적용 | **금액 필드 검증을 공통 스키마로 정의**해 "검증 유틸이 있는데 안 쓰는" 상태를 구조적으로 차단 |
| FND-16 | `find -exec` → `xargs` 또는 `-exec ... +`로 교체 | **CI 게이트가 실제로 실패를 잡는지 검증하는 절차 도입** — 게이트 추가 시 "의도적으로 실패시켜 빨간불을 확인"을 필수 단계로. 나아가 린트·커버리지 임계값·`npm audit`을 게이트로 편입(TPS Jidoka) |
| FND-17 | 3개 문서의 라우트/페이지 목록 갱신 | **문서 목록을 코드에서 생성**하거나, PR 템플릿 체크리스트에 "라우트/페이지 추가 시 ARCHITECTURE·ROADMAP 갱신" 항목 추가 |

### 6.2 다음 사이클(사이클 2) Plan 입력

Part 3 운영규칙 1에 따라 **감사 주기를 릴리스 단위(release-please 기준)로 고정**할 것을 권고한다. 사이클 2의 Plan 입력은 다음과 같다.

**승계 항목 (미해결 이슈)**
- 본 보고서 Fail 7항목(A5, B1, B2, B3, B6, C6, C7)을 우선순위 상단에 배치
- Partial 10항목 중 A1/A7은 Fail 전이 리스크가 있으므로 재확인 대상

**루브릭 개선 제안 (Kaizen — 루브릭 자체의 지속개선)**
1. **C1~C3 판정 가능화가 최우선이다.** 현행 루브릭은 "p75 RUM"을 요구하지만 제품에 RUM 계측이 없어 21항목 중 3항목(14%)이 구조적으로 판정 불가다. `web-vitals` 계측을 도입하거나, 단일 사용자 로컬 앱의 현실에 맞게 **"Lighthouse 실험실 측정 3회 중앙값"** 으로 판정 근거를 재정의할 것을 권고한다.
2. **B1의 "신규 코드 커버리지"는 현재 측정 인프라로 산출 불가하다.** 자식 프로세스 커버리지 병합 체계를 갖추거나, 측정 가능한 대체 지표(라우트별 HTTP 테스트 보유율 — 현재 7/18 = 39%)를 병기하도록 루브릭을 보강할 것을 권고한다.
3. **축 A에 CSRF 항목을 명시적으로 추가할 것을 권고한다.** 현행 A1은 "IDOR"에 초점이 맞춰져 있어, CWE Top25 3위이자 본 감사의 Critical 결함인 CSRF가 어느 항목에도 정면으로 대응하지 않는다. A1을 "접근통제(IDOR + CSRF)"로 확장하거나 A8을 신설해야 한다.
4. **A1/A4/A6의 "단일 사용자 예외" 처리 기준을 명문화할 것을 권고한다.** 현재 세 항목 모두 "설계상 해당 없음"과 "기준 미충족"의 경계가 감사자 재량에 맡겨져 있어 사이클 간 판정 일관성을 해친다.

**추적 지표(Part 3 운영규칙 5)**

| 지표 | 사이클 1 기준선 |
|---|---:|
| Pass 비율 | **19.0%** (4/21) |
| Fail 항목 수 | **7** |
| Critical/High 결함 수 | **5** |
| 코드 중복률 | 8.48% |
| CC>10 함수 비율 | 17.0% |
| 라우트 HTTP 테스트 보유율 | 39% (7/18) |
| 계측 가능 커버리지 | 78.11% (4개 파일 한정) |

### 6.3 감사 독립성에 관한 부기

Part 3 운영규칙 4는 감사팀이 개발팀과 조직적으로 분리 상태를 유지할 것을 요구한다. 본 감사는 개발 이력·이슈·PR 맥락을 참조하지 않고 코드 상태만으로 수행해 그 요건을 절차적으로 충족했다.

다만 **B4에서 확인된 대로 이 프로젝트의 개발·리뷰·승인이 단일 인물에 집중돼 있다는 사실 자체가 지속 리스크**다. 감사 보고서가 "경영검토에 준하는 의사결정권자"에게 보고돼야 한다는 운영규칙 4의 취지를 1인 프로젝트에서 구현하려면, **사람의 독립성 대신 자동 게이트의 독립성에 의존**하는 수밖에 없다. FND-16(무력화된 CI 게이트)이 다른 어떤 개별 결함보다 우선순위가 높다고 판단하는 이유다.

---

## 7. 감사 한계 및 확신도 표기

투명성을 위해 본 감사가 확증하지 못한 영역을 명시한다.

| 영역 | 상태 | 확신도 |
|---|---|---|
| FND-01/03/04/05, FND-16 | **격리 환경에서 직접 재현 완료** | 높음 (95%+) |
| FND-02 | 코드 경로 대조로 확증(클라이언트 `limit=5000` vs 서버 클램프 500) | 높음 (95%+) |
| A2(인젝션), A3(XSS), B5(순환의존) | 전수 검사 후 해당 없음 확인 | 높음 (90%+) |
| C4/C5 응답시간 | 실측(30회 p95, 2만/20만 건) | 높음 — 단 **로컬 루프백 단일 클라이언트 조건**이며 동시성 부하는 미측정 |
| B3 복잡도 수치 | 자체 근사 측정. JSX의 `&&`가 포함돼 **프론트엔드 수치는 과대평가 경향** | 중간 — 백엔드 수치와 "기준 초과" 결론은 신뢰 가능, 개별 숫자는 근사치 |
| B2 중복률 8.48% | 6줄 정확 일치 기준. SonarQube의 토큰 기반 측정과 값이 다를 수 있음(본 방식이 더 보수적) | 중간 — 3% 초과라는 결론은 견고 |
| C1/C2/C3 | **판정 불가** — 제품에 RUM 계측 부재 + 감사 환경 브라우저 뷰포트 `0x0`으로 페인트 지표 미발생 | 해당 없음 |
| A7 공급망 | `npm audit` 0건은 확인했으나 **`file:` 의존성이 어드바이저리 매칭 대상이 아니라는 점이 이 결과의 해석을 제약**. GitHub 저장소 수준의 Dependabot 활성화 여부는 로컬에서 확인 불가 | 중간 |
| B4 리뷰 응답시간 SLA | GitHub API 미조회로 **미확인**. 작성자 집중도만 git 이력으로 확인 | 부분 |
| 프론트엔드 런타임 동작 | 대시보드 렌더 정상 확인(2만 건 시드). **그 외 페이지의 상호작용은 미검증** | 부분 |
| 외부 API 연동(ECOS/EXIM/KIS) | 실제 호출 미수행(외부 비용/키 필요). 코드 검토만 수행 | 부분 |

**미수행 항목**: 동시성/경합 테스트, E2E 브라우저 테스트, SQLite WAL 동시접근 검증, 실제 카드사 엑셀 샘플 파싱 회귀(`ref/` 는 gitignore 대상), 의존성 라이선스 감사.

---

*본 보고서는 감사 결과만 기록하며 코드 수정을 포함하지 않는다. 시정조치의 채택·우선순위·일정은 개발팀 및 의사결정권자의 판단 사항이다.*
