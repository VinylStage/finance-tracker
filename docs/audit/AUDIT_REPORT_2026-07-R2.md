# finance-tracker 독립 코드 감사 보고서 — 2차 (R2)

**감사 대상**: finance-tracker v0.6.0
**기준 커밋**: `78cf793` (`develop`, "docs(audit): PDCA 1라운드 교차검토 — 감사팀↔개발팀 양방향 재검토 (#184)")
**감사 기준**: [`AUDIT_FRAMEWORK.md`](./AUDIT_FRAMEWORK.md) Part 2 통합 루브릭 — 축 A(보안) 7항목 / 축 B(코드품질) 7항목 / 축 C(성능) 7항목, 총 21항목
**감사일**: 2026-07-26
**감사 수행**: 독립 감사팀 세션 (개발 이력·이전 대화 맥락 없음)

---

## 0. 감사 독립성 및 방법 선언

ISO 9001 조항 9.2("감사자는 자신의 업무를 감사하지 않는다") 및 ISO/IEC 12207의
독립 검증 조항에 따라, 본 감사는 다음 조건에서 수행했다.

**독립성 확보 조치**

- 개발 이력·이전 세션 맥락 없이 코드베이스를 처음부터 직접 판독했다.
- 1차 감사 결과([`AUDIT_REPORT_2026-07.md`](./AUDIT_REPORT_2026-07.md))는 **판정 근거로 사용하지 않았다.**
  1차 발견사항(FND-xx)은 "리메디에이션이 실제로 적용됐는지 재확인"하는 대조군으로만
  참조했고, 재확인은 전부 현재 코드/실행 결과로 했다.
- 감사 도중 병행 개발세션이 같은 워크트리의 HEAD를 `develop`(78cf793) →
  `audit/2026-07-round2`(71ee766)로 전환하는 것을 감지했다. 판정 오염을 막기 위해
  별도 워크트리(`audit/2026-07-r2-independent`, 기준 78cf793)를 분리해 감사를 이어갔다.
  그 세션의 산출물 `AUDIT_REPORT_2026-07_ROUND2.md`는 **파일명 충돌 확인 목적으로
  첫 15줄만 열람했고 판정 근거로는 일절 사용하지 않았다.** 71ee766이 docs 단독
  커밋(코드 변경 0줄)임을 diff로 확인해, 본 감사의 코드 기준 시점이 유효함을 검증했다.

**판정 방법 — "읽고 추정"이 아니라 "실행하고 계측"**

루브릭 21항목 중 정량 기준이 있는 항목은 전부 직접 측정했다. 근거 없는 판정을
피하기 위해 사용한 계측은 다음과 같다.

| 측정 | 방법 |
|---|---|
| 테스트/커버리지 | `npm run test:coverage` 실행 (c8) |
| 순환복잡도 | AST 기반 McCabe CC 산출 (파서: `meriyah`, 신규 의존성 설치 없음) |
| 코드 중복률 | SonarQube 관행(연속 10줄·공백/주석 정규화 후 동일) 기반 클론 탐지 |
| API 응답시간 | 격리 DB에 20,000건 / 200,000건 시드 후 22개 엔드포인트 p50/p95 실측(각 30회) |
| 인덱스 사용 | `EXPLAIN QUERY PLAN` 12개 주요 쿼리 직접 확인 |
| 결함 재현 | 서버 기동 후 실제 HTTP 요청으로 13건 PoC 실행 |
| 번들/코드스플리팅 | `vite build` 실행 후 청크 산출물 확인 |
| 의존성 취약점 | `npm audit` root/client 각각 실행 |
| 순환의존/계층 | import 그래프 DFS 사이클 탐지 |
| PR 규모 | `git log --first-parent` 40건 churn 분포 |

**판정 척도**: Pass(기준 충족) / Partial(부분 충족, 개선권고) / Fail(미충족, 시정조치 필수)
— ISO 9001 조항 10.2 부적합 판정 구조.

---

## 1. 종합 판정

| | Pass | Partial | Fail | 계 |
|---|---|---|---|---|
| 축 A — 보안 | 4 | 3 | 0 | 7 |
| 축 B — 코드품질 | 2 | 5 | 0 | 7 |
| 축 C — 성능 | 5 | 2 | 0 | 7 |
| **합계** | **11 (52%)** | **10 (48%)** | **0 (0%)** | **21** |

**총평**

Fail 0건이다. 인젝션·XSS·보안헤더·의존성 같은 "있으면 곧바로 사고"인 항목은
실측으로 전부 통과했고, 성능은 20만 건 데이터에서도 루브릭 임계값 대비 한 자릿수
백분율 수준의 여유를 보였다(C4 기준 300ms 대비 최대 44.7ms). 1차 감사 이후의
리메디에이션(M0~M5)은 표본 검증한 범위에서 실제로 코드에 반영돼 있었다.

Partial 10건의 성격은 두 갈래로 나뉜다.

1. **위협모델상 해당 없음에 가까운 항목**(A1·A4·A6·C2) — 단일 사용자 로컬 앱이라
   인증/IDOR/HTTPS 요구사항 자체가 성립하지 않거나, INP처럼 랩 환경에서 원리적으로
   측정 불가한 항목이다. 다만 "해당 없음"을 강제하는 기술적 게이트가 없다는
   점에서 완전 면제로 보지 않았다(§3.1 참조).
2. **실제 시정이 필요한 항목**(B1·B3·B5·B6·C6) — 여기서 검증된 결함이 나왔다.
   특히 **C6의 `approval_number` 인덱스 누락**과 **B6의 입력검증 공백**은
   1차 감사가 다루지 않았거나 시정이 불완전하게 끝난 지점이다.

가장 주목할 발견은 **1차 감사 FND-06의 시정이 절반만 적용됐다는 것**이다.
커밋 `0cc89f8`("fix(#142): 리볼빙/부채/백업임포트 금액 필드에 asInt 검증 적용")은
`POST /api/debts/:id/interest`의 `interest_amount`만 패치했고, 같은 파일의
`POST /api/debts`의 `balance`·`annual_rate`는 손대지 않았다. 그 결과 1차 감사가
지목한 것과 **완전히 동일한 문자열 연결 오염**이 지금도 재현된다 —
`GET /api/debts`의 `total_balance`가 `"0abc1000"`(문자열)로 응답된다(§4.3, PoC R2-02).

---

## 2. 판정 요약표

### 축 A — 보안

| # | 체크 항목 | 판정 | 요약 근거 |
|---|---|---|---|
| A1 | 접근통제(IDOR) | **Partial** | 소유자 검증 미들웨어 0건이나 다중사용자 모델 자체가 없음. 단 부작용 있는 GET이 CSRF 방어를 우회(실측 확인), 파괴적 라우트 1건에 확인 토큰 없음 |
| A2 | 인젝션 방지 | **Pass** | 라우트 전수 판독 — 값 보간 SQL 0건. 동적 조각은 `?` 개수만 생성 |
| A3 | XSS 방지 | **Pass** | `dangerouslySetInnerHTML`/`innerHTML`/`eval` 각 0건. react-markdown이 raw HTML 미렌더 |
| A4 | 인증·세션 | **Partial** | 인증 기능 부재(문서화된 설계 결정). 무인증 전제를 강제하는 바인딩 게이트는 없음 |
| A5 | 설정 보안 | **Pass** | 보안헤더 4종 응답 실측, `X-Powered-By` 제거, `/api/*` 404, 에러 내부정보 은닉 실측 |
| A6 | 민감데이터 보호 | **Partial** | `.env` 미커밋·시크릿 마스킹 확인. HTTPS·저장 암호화는 미적용 |
| A7 | 의존성 공급망 | **Pass** | `npm audit` root/client 각 0건 실측. Dependabot 3종 + 주간 감사 워크플로 + CI 게이트 |

### 축 B — 코드품질

| # | 체크 항목 | 판정 | 요약 근거 |
|---|---|---|---|
| B1 | 테스트 커버리지 ≥80% | **Partial** | 백엔드 라인 81.38% / 브랜치 73.93%. **클라이언트 4,003 LOC 테스트 0건** |
| B2 | 코드 중복률 ≤3% | **Pass** | 실측 1.97%(백엔드 1.12% / 프론트 2.58%) |
| B3 | 복잡도 CC ≤10 | **Partial** | AST 실측 237개 함수 중 8개 초과. 최대 CC 22 |
| B4 | 리뷰 프로세스 | **Partial** | PR churn 중앙값 87줄(양호). 단독 메인테이너 self-merge 구조 |
| B5 | 계층분리·순환의존 | **Partial** | 순환 0건·계층위반 0건. 단 라우트 15개가 DB 직접 접근, 인라인 SQL 124개 |
| B6 | 트랜잭션·에러처리 | **Partial** | 트랜잭션 12곳·전역 에러 미들웨어·ErrorBoundary 확인. 단 입력검증 공백 6건 실측 |
| B7 | 프로세스 문서·추적성 | **Pass** | 요구사항→이슈→커밋→PR→CHANGELOG 추적 완비, ADR 4건 |

### 축 C — 성능

| # | 체크 항목 | 판정 | 요약 근거 |
|---|---|---|---|
| C1 | LCP p75 < 2.5s | **Pass** | Lighthouse 3회 중앙값 1,045ms |
| C2 | INP p75 < 200ms | **Partial** | INP는 필드 전용 지표라 랩 측정 불가. 대체지표 TBT=0ms |
| C3 | CLS p75 < 0.1 | **Pass** | 실측 0.000 (3회 전부) |
| C4 | 단순 CRUD p95 < 300ms | **Pass** | 20k건 최대 9.7ms / 200k건 최대 44.7ms |
| C5 | 집계 p95 < 800~1000ms | **Pass** | 20k건 최대 29.3ms / 200k건 최대 327.5ms |
| C6 | N+1 0건·주요 조회 인덱스 | **Partial** | N+1 제거 확인. **`approval_number` 인덱스 누락 → 임포트 중복체크 풀스캔** |
| C7 | 번들·렌더링 최적화 | **Pass** | React.lazy 10개 페이지 코드스플리팅 빌드 산출물로 확인 |

---

## 3. 축별 상세 판정

### 3.1 축 A — 보안

#### A1 — 접근통제(IDOR) : **Partial**

**통과기준**: 모든 리소스 엔드포인트가 소유자 검증 미들웨어를 거침

**사실관계**

- `users` 테이블도, 인증 미들웨어도, 소유자 컬럼도 존재하지 않는다
  (`src/db/init.js:15-125` 스키마 전문 확인). 따라서 "타 사용자 데이터 접근"이라는
  위협 자체가 성립하지 않는다.
- `docs/ARCHITECTURE.md:5`가 "단일 사용자 전용으로, 인증 없이 로컬에서 독립적으로
  실행"을 설계 전제로 명시한다.
- 기본 바인딩은 루프백이다(`src/server.js:71` `HOST || '127.0.0.1'`).

**그럼에도 Partial로 판정한 근거 3가지**

1. **무인증 전제를 강제하는 게이트가 없다.** `HOST=0.0.0.0`을 주면 전체 금융
   데이터 CRUD가 인증 없이 네트워크에 노출된다. 이를 막는 것은 콘솔 경고 한 줄이
   전부다(`src/server.js:74-76`). Poka-yoke(애초에 불가능한 구조) 관점에서
   "문서로만 존재하는 제약"이다.
2. **부작용 있는 GET이 CSRF 방어를 우회한다.** `GET /api/installments`가 요청마다
   `UPDATE installments SET status='완료'`를 실행한다
   (`src/routes/installments.js:22-30`, 호출 `:35`). `csrfGuard`는 POST/PUT/DELETE/PATCH만
   검사하므로(`src/utils/csrfGuard.js:13,16`) 이 쓰기 경로는 무검증이다.
   **실측: `Sec-Fetch-Site: cross-site` GET 1회로 `status`가 `진행중`→`완료`로 변경됨**(PoC R2-01).
3. **가장 파괴적인 라우트에만 확인 토큰이 없다.** `DELETE /api/transactions {all:true}`가
   전체 거래를 삭제하는데 토큰이 없다(`src/routes/transactions.js:282-285`).
   같은 코드베이스의 `POST /api/data/import`(overwrite)는 `confirm:"DELETE_ALL"`을,
   `POST /api/export/settings/restore`는 `confirm:"OVERWRITE_SETTINGS"`를 요구한다
   (`src/routes/data.js:124`, `src/routes/export.js:190`). 정책이 일관되지 않다.
   **실측: 토큰 없이 HTTP 200, total 1→0**(PoC R2-07).

#### A2 — 인젝션 방지 : **Pass**

- 라우트 17개 + 서비스 5개 전수 판독. 사용자 입력이 SQL 문자열에 직접 보간되는
  지점 0건.
- 템플릿 리터럴 보간이 있는 5곳(`transactions.js:24,290`, `dataIntegrity.js:30,35,41,46`)은
  전부 **`?` 플레이스홀더 개수만 생성**하고 값은 바인딩한다. 예:
  `ids.map(() => '?').join(',')` — `ids`는 `asInt()`로 정수 필터링을 이미 거친다
  (`src/routes/transactions.js:23`).
- LIKE 검색은 와일드카드 이스케이프 + `ESCAPE '\'` 절을 함께 쓴다
  (`src/utils/validate.js:17-19`, 사용 `transactions.js:26,27,575`).
- `EXPLAIN QUERY PLAN` 실행으로 모든 쿼리가 정상 준비(prepare)됨을 부수적으로 확인했다.

#### A3 — XSS 방지 : **Pass**

- `client/src` 및 `src` 전체에서 `dangerouslySetInnerHTML` 0건, `innerHTML` 0건,
  `eval(` 0건.
- 유일한 마크다운 렌더링(`client/src/pages/Guide.jsx:38`)은 `react-markdown`을
  `rehype-raw` 없이 사용 → raw HTML은 텍스트로 이스케이프된다. 콘텐츠 출처도
  서버 로컬 파일(`docs/GUIDE.md`)이라 사용자 입력이 아니다(`src/routes/guide.js:7`).
- CSP `script-src 'self'`가 인라인 스크립트 실행을 차단한다(응답 헤더 실측).

#### A4 — 인증·세션 : **Partial**

**통과기준**: bcrypt/argon2, HttpOnly+Secure+SameSite 쿠키

인증 기능이 존재하지 않으므로 두 기준 모두 해당 구현이 0건이다. 이것은 결함이
아니라 문서화된 설계 결정(`docs/ARCHITECTURE.md:5`)이며, ISO 9001 10.2의
"부적합(요구사항 미충족)"으로 보기 어렵다 — 요구사항 자체가 없다.

다만 **Pass로 판정하면 거짓 안심을 준다.** A1과 같은 이유로 Partial로 둔다:
무인증이 안전한 것은 오직 루프백 바인딩 전제 위에서인데, 그 전제가 강제되지 않는다.

> **권고**: `HOST`가 루프백이 아닐 때 기동을 거부하거나 명시적 opt-in 환경변수
> (`ALLOW_NETWORK_EXPOSURE=1` 등)를 요구하도록 바꾸면, A1·A4의 Partial 사유가
> 동시에 해소되고 TPS의 Poka-yoke 원칙에 부합한다.

#### A5 — 설정 보안 : **Pass**

응답 헤더 실측 결과(`GET /api/health`):

```
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: no-referrer
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
                         img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'
x-powered-by: (없음)
```

- Helmet 없이 필요한 헤더만 직접 설정(`src/utils/securityHeaders.js`) — 의존성
  표면을 늘리지 않는 합리적 선택이다.
- HSTS 생략은 **의도적이고 옳다** — HTTP로만 서빙하는 로컬 앱에 HSTS를 보내면
  브라우저가 HTTPS 강제를 학습해 접속 불가를 유발한다(코드 주석에 근거 명시,
  `securityHeaders.js:8-10`).
- CORS 미들웨어가 아예 없다 — 동일 오리진 서빙이므로 **없는 편이 더 안전하다**
  (화이트리스트 오설정 위험 제거).
- `csrfGuard` 동작 실측: cross-site → 403, same-origin → 201, 브라우저 신호 없음 → 통과
  (설계상 의도, `csrfGuard.js:31`). 상태변경 메서드에 한해 정상 동작한다.
- 프로덕션 디버그 개념 자체가 없고, `serverError()`가 `NODE_ENV`와 무관하게 항상
  내부정보를 숨긴다(`src/utils/errors.js:6-11`) — 환경변수 오설정으로 새지 않는 구조다.
- `/api/*` 전용 404 핸들러가 SPA 폴백보다 앞에 등록돼 있다(`src/server.js:45`).
  **실측: `GET /api/does-not-exist` → 404 `{"error":"Not found"}`**.

> `style-src 'unsafe-inline'`은 Recharts의 인라인 스타일 주입 때문에 필요하다.
> 스타일 기반 공격 표면은 스크립트 대비 제한적이므로 수용 가능하나, 향후 nonce
> 기반으로 좁힐 여지는 있다.

#### A6 — 민감데이터 보호 : **Partial**

**통과기준**: HTTPS 강제 / `.env` 미커밋 / 로그 내 평문 크레덴셜 0건 — **2/3 충족**

| 기준 | 결과 |
|---|---|
| `.env` 미커밋 | ✅ `.gitignore:4`에 등재, `git ls-files .env` 미추적 확인. 실제 파일에 `ECOS_API_KEY`/`EXIM_API_KEY` 값이 있으나 커밋되지 않음 |
| 로그 내 평문 크레덴셜 | ✅ `maskSecrets()`가 4개 시크릿 환경변수를 에러 메시지에서 치환(`src/utils/http.js:5-15`). 외부 API 키가 URL 쿼리에 실리는 구조라 이 방어가 실효적임 |
| HTTPS 강제 | ❌ HTTP 전용 |
| (참고) SQLite 파일 암호화 | ❌ 평문 저장. `data/`는 gitignore 처리됨 |

로컬 루프백 전용이라는 전제에서는 HTTPS/저장 암호화 부재가 합리적이지만,
루브릭 문언 기준으로는 미충족이므로 Partial이다.

#### A7 — 의존성 공급망 : **Pass**

**통과기준**: npm audit 상 Critical/High 취약점 0건

- 실측: root `{"critical":0,"high":0,"moderate":0,"low":0,"total":0}`,
  client도 동일하게 0건.
- CI에 `npm audit --audit-level=high` 게이트가 root/client 각각 걸려 있다
  (`.github/workflows/ci.yml`).
- Dependabot이 npm(root)·npm(client)·github-actions 3개 생태계를 주간으로 감시한다.
- 주간 `maintenance-audit.yml` 워크플로가 별도로 이슈를 자동 생성한다.

**단, 감사 사각지대가 하나 있고 이미 문서화돼 있다.** `xlsx`는 npm이 아니라
레포에 커밋된 tarball(`vendor/xlsx-0.20.3.tgz`, 2,409,319 bytes, 추적 확인)을
`file:` 프로토콜로 참조한다. `file:` 의존성은 어드바이저리 매칭 대상이 아니므로
`npm audit` 0건이 이 패키지의 안전을 보장하지 않는다.
[ADR 0004](../decisions/0004-xlsx-vendored-upgrade.md)가 이 트레이드오프를 정확히
서술하고 리스크를 수용했으며, `dependabot.yml`에도 `ignore` 사유가 주석으로 남아 있다.

기준 문언("npm audit 상 0건")을 충족하고 잔여 리스크가 식별·문서화·수용됐으므로
Pass로 판정한다. 다만 보상통제의 트리거가 "Dependabot이 다른 취약점 PR을 열 때
김에 확인"이라 **발동 시점이 외부 사건에 종속**된다(§5 권고 A7-1).

---

### 3.2 축 B — 코드품질

#### B1 — 테스트 커버리지 : **Partial**

**통과기준**: 신규 코드 커버리지 ≥ 80%

**실측 (`npm run test:coverage`, 테스트 103개 전량 통과, assert 호출 335회)**

| 범위 | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| 전체(백엔드) | 81.38% | **73.93%** | 82.60% | 81.38% |
| `src/routes` | 80.27% | 71.59% | **74.46%** | 80.27% |
| `src/utils` | 91.54% | 93.22% | 90.47% | 91.54% |
| `src/services` | 70.44% | 72.95% | 89.47% | 70.44% |
| **`client/src`** | **측정 대상 아님** | — | — | — |

**Partial 판정 근거 3가지**

1. **클라이언트 4,003 LOC에 테스트가 0건이다.** 테스트 러너 설정조차 없다
   (`client/package.json`에 test 스크립트 없음, `*.test.*`/`*.spec.*` 파일 0건).
   백엔드 3,500 LOC와 합치면 코드베이스의 **53%가 커버리지 지표에 아예 잡히지
   않는다.** "81.38%"라는 숫자는 백엔드만의 값이며, 전체 기준으로 환산하면
   대략 44% 수준이다. 여기에는 `Settings.jsx`(1,032줄), `Dashboard.jsx`(534줄)
   같은 큰 파일이 전부 포함된다.
2. **브랜치 커버리지 73.93%가 80% 미만이다.** SonarQube의 `coverage` 지표는
   라인과 조건을 결합해 계산하므로, 라인 81.38%/브랜치 73.93% 조합은 Sonar way
   기준 80%에 도달하지 못한다.
3. **CI 게이트 자체가 80% 미만으로 설정돼 있다.** `package.json:13`의
   `--lines 75 --branches 65 --functions 75 --statements 75`는 루브릭 기준(80%)보다
   낮다. 즉 현재 CI는 루브릭 위반을 통과시킨다.

**커버리지가 특히 낮은 지점**: `transactions.js` 68.40% Lines / **58.33% Funcs**
(595줄, 최대 라우트 파일), `cardImport.js` 63.43%, `cardExcelImport.js` 67.34%,
`ecosService.js` **0%**.

#### B2 — 코드 중복률 : **Pass**

**통과기준**: ≤ 3%

**실측** (연속 10줄 이상 동일 블록, 주석·공백 정규화 후)

| 범위 | 유효 라인 | 중복 라인 | 중복률 |
|---|---|---|---|
| 백엔드 `src` | 2,325 | 26 | **1.12%** |
| 프론트 `client/src` | 3,258 | 84 | **2.58%** |
| **전체** | **5,583** | **110** | **1.97%** |

1차 감사 FND-13의 시정(날짜 헬퍼·집계 SQL 조각을 `utils/date.js`·`utils/aggregation.js`로
추출)이 실제로 효과를 냈다. 남은 중복은 다음과 같고 전부 기준 이내다.

- `src/services/cardExcelImport.js` 26줄(14.8%) — 카드사별 파서 3종의 헤더 탐색
  루프가 유사(`:49`↔`:82`↔`:164`). 카드사마다 포맷이 달라 억지 통합이 오히려
  위험할 수 있는 유형이다.
- 프론트: 테이블 렌더 블록이 `TransactionList.jsx:109` ↔ `Installments.jsx:153`
  ↔ `Revolving.jsx:127`에 반복, `Settings.jsx` 내부 자기중복 36줄(`:177`↔`:518`).

#### B3 — 복잡도 : **Partial**

**통과기준**: 함수당 Cyclomatic ≤ 10

**AST 기반 실측: 총 237개 함수 중 8개(3.4%)가 초과**

| CC | 위치 | 비고 |
|---:|---|---|
| **22** | `src/routes/data.js:16` `resolveImportRow` | 최대. 아래 설명 참조 |
| 15 | `src/routes/transactions.js:16` `buildTransactionFilters` | |
| 15 | `src/services/cardExcelImport.js:97` `parseSamsungExcel` | |
| 13 | `src/routes/recurringRules.js:23` `validateRuleBody` | |
| 13 | `src/services/csvImport.js:8` `parseCsv` | |
| 12 | `src/routes/transactions.js:106` `periodComparisonDaily` | |
| 12 | `src/routes/transactions.js:358` `validateTxBody` | |
| 11 | `src/services/cardExcelImport.js:180` `parseHyundaiExcel` | |

**주목할 점**: 최대 복잡도 함수 `resolveImportRow`는 **1차 감사 대응 리팩터링이
만들어낸 함수다.** 커밋 `5d34591`("refactor(#148): 순환복잡도 상위 2개 함수
(data.js/cardImport.js) 분리")의 주석은 "`POST /import` 핸들러 하나에 … 순환복잡도가
43까지 올라갔다"고 서술하고 검증·정규화 부분을 이 함수로 떼어냈다. 결과적으로
**호출부는 CC 9로 내려갔지만(`data.js:110`), 복잡도가 사라진 게 아니라
피호출부로 이동해 여전히 코드베이스 최고치(22)로 남았다.**

CC 22의 내역(수작업 대조 검증 완료): `||` 4개(`isLegacy` 판정, `:37-39`),
삼항 5개(`:41-45` 레거시 필드 폴백), `if` 7개, `&&` 2개(`:49,53` FK 폴백),
`||` 3개(`:18,29`).

> 이 함수는 "레거시 백업 포맷 판정 + 필드 폴백 + FK 폴백 + 형식 검증"이라는
> 4개 관심사가 한 함수에 남아 있다. 관심사 단위로 다시 쪼개면 각 CC 5~8 수준으로
> 내려간다(§5 권고 B3-1).

**정적분석 도구 부재**: ESLint/Prettier/SonarQube 설정 파일이 하나도 없다.
CI의 "Check JS syntax" 단계는 `node --check`(구문 파싱)일 뿐 정적분석이 아니므로,
복잡도·중복도·코드스멜을 자동으로 막는 게이트가 현재 존재하지 않는다.

#### B4 — 리뷰 프로세스 : **Partial**

**통과기준**: PR 크기 중앙값 < 400줄, 응답 1영업일 이내

**실측** (`git log --first-parent` 40건, squash-merge라 커밋 1건 = PR 1건)

- **churn 중앙값 87줄** — 기준 대폭 충족. Google eng-practices의 "100줄 내외 이상적"에 부합.
- p90 1,275줄, 최대 3,200줄. 400줄 초과 PR은 7/40 (18%).
- 큰 PR은 대부분 문서·테스트 동반 커밋이다(예: `275674a` 1,734줄 중 상당수가
  `lighthouse-baseline.json`과 문서).

**프로세스 인프라는 양호하다**: PR 템플릿, 이슈 템플릿 3종, CODEOWNERS,
Conventional Commits 검증 워크플로(`pr-title-check.yml`), release-please 자동 버저닝.

**Partial 판정 근거**: `.github/CODEOWNERS`가 `* @VinylStage` 단독이다.
리뷰어와 작성자가 동일인이므로 **ISO 9001 조항 9.2의 독립성 원칙과 Microsoft
Playbook이 근거로 드는 "리뷰된 코드는 결함 20~30% 감소" 효과가 구조적으로
성립하지 않는다.** 리뷰 응답시간(1영업일)은 self-merge 구조에서는 측정 의미가 없어
평가하지 않았다. 이는 개인 프로젝트의 불가피한 제약이므로 결함이라기보다
**자동 게이트로 보완해야 할 항목**이다(§5 권고 B4-1).

#### B5 — 계층분리·순환의존 : **Partial**

**통과기준**: 라우트-컨트롤러-모델 분리, 순환의존 0건

| 항목 | 결과 |
|---|---|
| 순환 의존성 | **0건** (import 그래프 DFS 실측) |
| 계층 위반(route→route) | **0건** |
| 역방향 의존(utils/services→routes) | **0건** |
| 라우트-컨트롤러-모델 분리 | **미충족** |

의존 방향은 깨끗하다. 그러나 **모델/리포지토리 계층이 존재하지 않는다**:

- `src/routes/` 15개 파일이 `require('../db/init')`로 DB에 직접 접근한다.
- 라우트 안에 `db.prepare(...)` 호출이 **124개** 인라인으로 흩어져 있다.
- `src/services/`의 5개 파일은 외부 API 클라이언트 3개(`ecos`/`exim`/`kis`)와
  임포트 파서 2개(`cardExcelImport`/`csvImport`)일 뿐, 도메인 서비스가 아니다.
- `src/utils/aggregation.js`는 이름과 달리 `db/init`을 의존하는 **사실상 리포지토리**다
  (`aggregation.js:2`). 유틸 계층에 DB 접근이 섞여 있다.

즉 현재 구조는 "라우트 = 컨트롤러 + 모델"이다. 이것이 B1(라우트 테스트가 HTTP
통합테스트로만 가능해 커버리지가 낮음)과 B2(SQL 조각 중복)의 공통 원인이기도 하다.

#### B6 — 트랜잭션·에러처리 : **Partial**

**갖춰진 것 (확인 완료)**

- `db.transaction()` 12곳 적용 — 다중 write가 있는 경로(설정 복원, 백업 임포트,
  카드/CSV 임포트, 부채 이자, 적금 만기, 반복거래 확정, 마이그레이션)를 모두 덮는다.
- `foreign_keys = ON`, `journal_mode = WAL` (`src/db/init.js:12-13`).
- 전역 에러 미들웨어가 마지막에 등록돼 있고, Express 5가 async reject까지
  전달하므로 개별 try/catch 누락과 무관하게 최종 방어선이 된다(`src/server.js:67-69`).
- 프론트 `ErrorBoundary`(`main.jsx:10`)와 `useLoader`의 시퀀스 가드
  (오래된 응답이 최신 응답을 덮는 경쟁조건 방지, `useLoader.js:22,35,38`).

**실측된 결함 (전부 PoC 재현)**

| ID | 결함 | 실측 결과 |
|---|---|---|
| R2-08 | 없는 리소스 PUT/DELETE가 404가 아니라 `200 {ok:true}` | 7개 라우트 전부 200 |
| R2-02 | `POST /api/debts`의 `balance`/`annual_rate` 미검증 | `total_balance = "0abc1000"` |
| R2-03 | `POST /api/installments`의 금액·개월 미검증 | `months:"Y"` 그대로 저장 |
| R2-05 | `POST /api/export/settings/restore` 페이로드 타입 미검증 | 400이어야 할 입력이 500 |
| R2-06 | `suggest/merchants`의 `limit` 미검증 | `limit=1.5` → **500** |
| R2-13 | 필수값 누락·UNIQUE 충돌이 400/409가 아니라 500 | 3케이스 모두 500 |

세부는 §4에 정리했다. 추가로:

- **임포트 시 '미분류' 카테고리 생성이 트랜잭션 밖에서 일어난다.**
  `cardImport.js:95`(호출 `:102`)와 `csvImport.js:47`이 `db.transaction()`
  (각 `:107`, `:51`) **이전**에 실행된다. 임포트가 롤백돼도 카테고리는 남는다.

#### B7 — 프로세스 문서·추적성 : **Pass**

**통과기준**: 요구사항-커밋-테스트 추적 가능

추적성 사슬이 완결돼 있다. 최근 20개 커밋 전수 확인 결과 **모든 커밋이
`type(#이슈번호): 설명 (#PR번호)` 형식**을 지킨다. 예:
`fix(#145): 비sargable WHERE를 범위 비교로 재작성, installments 인덱스 추가 (#173)`.

- 필수 문서 전부 존재: `ARCHITECTURE.md`(117줄), `ROADMAP.md`(70줄),
  `IMPLEMENTATION_AUDIT.md`(73줄), `API.md`(997줄), `DATA_MODEL.md`,
  `REQUIREMENTS.md`, `CONTRIBUTING.md`, `README.md`.
- ADR 4건(`docs/decisions/`) — 특히 0003→0004로 이어지는 xlsx 취약점 대응 기록은
  대안 3가지 실측 비교(13개 파일 중 3개만 성공 = 23%)까지 담은 모범 사례다.
- 다이어그램 5건, `CHANGELOG.md` 34KB(release-please 자동 생성).
- 마이그레이션 4건이 `schema_migrations` 테이블로 멱등 적용된다(`src/db/migrate.js`).

**경미한 stale 1건**: `IMPLEMENTATION_AUDIT.md`의 기술부채 목록에
"SQLite DB의 스키마 변경 로그 관리 방식 정리"가 미결로 남아 있으나,
마이그레이션 체계(#89)가 이미 도입돼 `migrations/` + `schema_migrations`로
해결된 상태다. Pass 판정을 뒤집을 정도는 아니므로 권고로 분류한다.

---

### 3.3 축 C — 성능

#### 측정 조건

- API: 격리 DB에 거래 20,000건 / 200,000건 + 할부 500건 시드, 엔드포인트당
  워밍업 3회 후 30회 측정, p50/p95 산출. 서버·클라이언트 동일 호스트(로컬 루프백).
- Web Vitals: `docs/audit/PERFORMANCE_BASELINE.md`의 기존 측정(Lighthouse desktop
  preset 3회 중앙값)을 채택하고, 방법론 타당성을 검토했다.

#### C1 — LCP : **Pass** / C3 — CLS : **Pass** / C2 — INP : **Partial**

| 지표 | 측정값 | 기준 | 판정 |
|---|---|---|---|
| LCP | 1,045ms (3회 편차 ~1ms) | < 2,500ms | Pass |
| CLS | **0.000** (3회 전부) | < 0.1 | Pass |
| INP | **측정 불가** (대체 TBT = 0ms) | < 200ms | Partial |
| (참고) 성능 점수 | 97/100 | — | — |

**C2를 Partial로 두는 이유**: INP는 실사용자 상호작용에서만 산출되는 필드(RUM)
전용 지표라 랩 환경에서 원리적으로 측정할 수 없다. `PERFORMANCE_BASELINE.md`가
이 한계를 정확히 서술하고 TBT를 대체지표로 채택한 것은 방법론적으로 타당하며,
TBT 0ms는 메인 스레드 차단이 없다는 강한 신호다. 다만 **루브릭이 요구하는 지표
자체에 대한 직접 측정치가 없으므로** Pass로 올리지 않는다. (이는 코드 결함이 아니라
계측 범위의 문제다.)

**측정 범위의 구조적 한계 (기존 문서와 동일 판단)**: 이 앱은 React Router 없이
`App.jsx`의 `useState`로 탭을 전환한다(`client/src/App.jsx:28,55-64`). 탭별 URL이
없으므로 Lighthouse는 **최초 진입 페이지(대시보드)만** 측정할 수 있다.
`Transactions`·`Settings` 등 나머지 9개 페이지는 이 방법으로 검증되지 않았다.

#### C4 — 단순 CRUD p95 < 300ms : **Pass**

| 엔드포인트 | 20k건 p95 | 200k건 p95 |
|---|---:|---:|
| `GET /api/transactions?limit=100` | 2.7ms | 3.0ms |
| `GET /api/transactions/:id` | 1.8ms | 1.8ms |
| `GET /api/categories` | 2.0ms | 1.9ms |
| `GET /api/payment-methods` | 2.1ms | 1.8ms |
| `GET /api/settings` | 2.1ms | 1.9ms |
| `GET /api/debts` | 1.9ms | 2.4ms |
| `POST /api/transactions` | 2.3ms | 2.3ms |
| `GET /api/transactions/suggest/merchants` | 9.7ms | **44.7ms** |

기준 300ms 대비 최악값이 44.7ms — **6.7배 여유**. 다만 자동완성만 데이터량에
선형 비례한다(전체 `GROUP BY merchant`).

#### C5 — 집계·리포트 p95 < 800~1000ms : **Pass**

| 엔드포인트 | 20k건 p95 | 200k건 p95 |
|---|---:|---:|
| `GET /api/transactions/summary/dashboard` | 7.6ms | 145.9ms |
| `GET /api/transactions/summary/by-month?year=` | 3.9ms | 35.9ms |
| `period-comparison?period=monthly` | 7.5ms | 115.8ms |
| `period-comparison?period=yearly` | 15.7ms | **291.3ms** |
| `period-comparison?period=daily` | 2.2ms | 10.1ms |
| `GET /api/cashflow?granularity=monthly` | 4.0ms | 34.6ms |
| `GET /api/transactions/summary/category-breakdown` | 5.3ms | 79.3ms |
| `GET /api/data-integrity` | 15.3ms | 159.7ms |
| `GET /api/installments` | 3.1ms | 3.2ms |
| `GET /api/export/json` (전체 백업) | 29.3ms | **325.2ms** |
| `GET /api/export/csv` | 25.3ms | 327.5ms |

기준 800ms 대비 최악값 327.5ms — **2.4배 여유**. 20만 건은 개인 가계부로서
비현실적으로 큰 규모이므로 실사용 여유는 훨씬 크다.

#### C6 — N+1 0건·주요 조회 인덱스 : **Partial**

**N+1은 실제로 제거됐다.** `EXPLAIN QUERY PLAN`으로 확인한 결과 1차 감사 FND-07/08의
시정이 유효하다:

```
 IDX  목록: date 범위 + ORDER BY date DESC
        SEARCH t USING INDEX idx_tx_date (date>? AND date<?)
 IDX  대시보드: 이번달 수입(sargable 범위비교)
        SEARCH t USING INDEX idx_tx_date … | BLOOM FILTER ON c | SEARCH c USING INTEGER PRIMARY KEY
 IDX  월별 트렌드: 범위 WHERE + GROUP BY strftime
        SEARCH t USING INDEX idx_tx_date (date>? AND date<?)
```

`strftime()`으로 인덱스 컬럼을 감싸던 비sargable WHERE가 전부 범위 비교로
바뀌어 `idx_tx_date`를 정상적으로 탄다.

**그러나 인덱스 누락이 1건 남아 있고, 이것이 가장 비용이 큰 실행 경로에 있다.**

```
SCAN  카드임포트 중복: approval_number=?
        SCAN transactions          ← 인덱스 없음, 풀 테이블 스캔
```

`transactions.approval_number`에 인덱스가 없다. 이 컬럼은
마이그레이션 `003-add-transactions-approval-number.js`로 추가됐으나 인덱스가 함께
만들어지지 않았다(현재 `transactions` 인덱스: `idx_tx_date`, `idx_tx_category`,
`idx_tx_merchant` 3개뿐).

문제는 이 쿼리가 **임포트 행마다 1회씩** 실행된다는 점이다
(`src/routes/cardImport.js:60-64` `findDuplicateTransaction()`, 호출 `:71`(preview)과 `:110`(실제 저장)).

**실측 (거래 200,000건 기준, 500행 카드 명세서 1장)**

| 조건 | 실행계획 | 500행 총 소요 | 행당 |
|---|---|---:|---:|
| 현재 (인덱스 없음) | `SCAN transactions` | **2,097.9ms** | 4.196ms |
| `CREATE INDEX idx_tx_approval` 추가 후 | `SEARCH … USING COVERING INDEX` | **1.3ms** | 0.003ms |

**개선 배수 1,666×.**

`upload.array('files', 30)`으로 요청당 최대 30개 파일을 받으므로(`cardImport.js:195`),
30파일 × 500행 = 15,000행이면 중복체크만 약 63초다(4.196ms × 15,000, 선형 외삽).
게다가 사용자가 미리보기 후 실제 임포트를 하면 **동일 스캔이 2회 반복된다**.

부수적으로 `GET /api/data-integrity`의 중복 승인번호 점검도
`SCAN transactions | USE TEMP B-TREE FOR GROUP BY`로 실행된다.

> **참고(과대해석 방지)**: 할부 이번달 청구 합계 쿼리도 `SCAN installments`로 나오지만,
> 이는 `idx_installments_status_start`가 없어서가 아니라 시드 데이터의 `status`가
> 전부 `'진행중'`이라 인덱스 선택도가 0이어서 SQLite가 스캔을 택한 것이다.
> 할부 행 수 자체가 작아(실측 p95 3.2ms) 실질 문제가 아니다. 결함으로 계상하지 않았다.

#### C7 — 번들·렌더링 최적화 : **Pass**

**통과기준**: 코드 스플리팅 적용, 불필요 리렌더링 없음

`vite build` 실행 결과 코드 스플리팅이 실제로 동작함을 확인했다
(`client/src/App.jsx:3-12`의 `React.lazy` 10개가 각각 별도 청크로 산출):

| 청크 | 크기 | gzip |
|---|---:|---:|
| `index-*.js` (초기 로드) | 198.3 kB | 63.1 kB |
| `index-*.css` | 22.7 kB | 5.2 kB |
| `CartesianChart-*.js` (Recharts, Dashboard와 함께 지연로드) | 355.1 kB | 103.3 kB |
| `Guide-*.js` (react-markdown) | 117.0 kB | 35.5 kB |
| `Dashboard-*.js` | 54.4 kB | 15.2 kB |
| `Settings-*.js` | 34.3 kB | 7.0 kB |
| 나머지 페이지 6종 | 각 5~17 kB | 각 2~5 kB |

초기 로드가 68 kB(gzip)로 억제되고 무거운 의존성(Recharts 103 kB, react-markdown
35 kB)이 필요 시점까지 미뤄진다 — LCP 1,045ms의 직접적 근거다.

`useMemo`/`useCallback`도 비용이 큰 지점에 선별 적용돼 있다
(`Dashboard.jsx:46,258,267,272`, `Transactions.jsx:72,136`, `Simulator.jsx:35`,
`ConfirmProvider.jsx:34`).

**Pass로 판정하되 다음은 계측되지 않았음을 명시한다**: `React.memo` 사용 0건이며,
리렌더 횟수를 계측하는 인프라(React DevTools Profiler 세션, 렌더 카운터 테스트)가
없다. TBT 0ms는 렌더 비용이 문제 수준이 아님을 시사하지만,
"불필요 리렌더링 없음"을 **직접 확인한 것은 아니다**(§5 권고 C7-1).

---

## 4. 주요 발견사항 (Top Findings)

전 항목 실제 HTTP 요청으로 재현했다. `[재현됨]`은 PoC 스크립트에서 기대 동작과
다른 결과가 실제로 관측됐음을 뜻한다.

### 4.1 [High] `approval_number` 인덱스 누락 — 카드 임포트 중복체크가 행당 풀스캔

- **축/항목**: C6
- **위치**: `src/db/init.js:47-49` (인덱스 정의부), `migrations/003-add-transactions-approval-number.js`,
  `src/routes/cardImport.js:60-64,71,110`
- **증상**: `SELECT id FROM transactions WHERE approval_number = ?`가
  `SCAN transactions`로 실행된다. 이 쿼리는 임포트되는 카드 명세서 **행마다 1회**
  실행되며, 미리보기와 실제 저장에서 각각 반복된다.
- **실측**: 거래 200,000건 / 500행 명세서 → **2,097.9ms** (인덱스 추가 시 1.3ms, **1,666배**)
- **영향**: 요청당 최대 30파일이 허용되므로 대량 임포트 시 응답이 분 단위로 늘어날 수 있다.
  현재 데이터 규모에서는 체감되지 않으나, 누적될수록 선형으로 악화된다.
- **분류**: 즉시수정(correction) — `CREATE INDEX idx_tx_approval ON transactions(approval_number)`
- **비고**: 1차 감사 FND-08이 `idx_installments_status_start`를 추가했으나
  `approval_number`는 검토 대상에 포함되지 않았다.

### 4.2 [High] 부작용 있는 GET이 CSRF 방어를 우회한다 `[재현됨]`

- **축/항목**: A1, B6
- **위치**: `src/routes/installments.js:22-30` `completeExpiredInstallments()`, 호출 `:35`
- **증상**: `GET /api/installments`가 매 요청마다 `UPDATE installments SET status='완료' …`를
  실행한다. `csrfGuard`는 POST/PUT/DELETE/PATCH만 검사하므로
  (`src/utils/csrfGuard.js:13,16`) 이 쓰기 경로에는 어떤 출처 검증도 적용되지 않는다.
- **실측**: `Sec-Fetch-Site: cross-site` 헤더를 붙인 GET 1회로
  `status`가 `'진행중'` → `'완료'`로 변경됨.
- **영향**: 악성 페이지의 `<img src="http://127.0.0.1:3000/api/installments">` 한 줄로
  로컬 앱의 DB 상태를 바꿀 수 있다. 변경 내용이 결정론적(기간 만료 할부만 완료 처리)이라
  데이터 파괴는 아니지만, **HTTP 안전 메서드(safe method) 계약 위반**이며
  CSRF 방어의 전제를 무너뜨린다.
- **분류**: 근본 시정조치(corrective action) — 상태 전이를 GET에서 분리해
  명시적 엔드포인트(`POST /api/installments/reconcile`)나 조회 시점 **계산**(저장 없이)으로 옮긴다.
- **비고**: 이 코드는 `#121`(할부 자동완료) 대응으로 도입됐다. 리메디에이션이
  새로운 유형의 문제를 만든 사례다.

### 4.3 [High] FND-06 시정이 절반만 적용 — 부채 잔액 타입 오염이 여전히 재현된다 `[재현됨]`

- **축/항목**: B6
- **위치**: `src/routes/debts.js:27-34` (`POST /`), `:42-55` (`PUT /:id`)
- **증상**: `balance`·`annual_rate`에 `asInt()` 검증이 없다. 문자열이 그대로 저장되고,
  `GET /api/debts`의 합산(`debts.js:16-17` `reduce((s,d) => s + d.balance, 0)`)이
  **문자열 연결로 동작**한다.
- **실측**: `POST {name:"POC오염", balance:"abc"}` → **HTTP 201**(거부되지 않음),
  이후 `GET /api/debts` → `total_balance: "0abc1000"` (typeof **string**)
- **리메디에이션 추적**: 커밋 `0cc89f8` "fix(#142): 리볼빙/부채/백업임포트 금액 필드에
  asInt 검증 적용"의 diff를 확인한 결과, `debts.js`에서 실제로 수정된 것은
  `POST /:id/interest`의 `interest_amount` **한 곳뿐**이다(+9줄). 커밋 메시지의
  "부채 … 금액 필드"가 실제 적용 범위보다 넓게 서술돼 있다.
- **대조**: 같은 커밋이 `revolving.js`에는 5개 필드 전부에 대한 검증 함수를
  제대로 도입했다(`revolving.js:14-19` `validateRevolvingNumericFields`).
- **분류**: 근본 시정조치 — `revolving.js`와 동일한 필드 단위 검증을 `debts.js`에 적용.
  나아가 **왜 시정이 부분 적용으로 끝났는지**가 진짜 근본원인이다(§6 참조).

### 4.4 [Medium-High] 클라이언트 4,003 LOC에 테스트가 0건

- **축/항목**: B1
- **사실**: `client/` 하위에 테스트 파일 0건, 테스트 러너 설정 0건.
- **영향**: 보고되는 커버리지 81.38%는 백엔드 전용 값이며, 코드베이스의 **53%가
  지표에서 누락**된다. 전체 기준 실질 커버리지는 약 44%로, 루브릭 80%와 큰 격차가 있다.
  `Settings.jsx`(1,032줄), `Dashboard.jsx`(534줄), `Transactions.jsx`(383줄)처럼
  금액 계산·집계 표시 로직을 담은 파일이 전부 무검증 상태다.
- **분류**: 근본 시정조치 — Vitest + Testing Library 도입(신규 의존성 → 승인 필요),
  최소한 금액 포매팅·집계 파생값·폼 검증 경로부터.

### 4.5 [Medium] 없는 리소스에 대한 PUT/DELETE가 404가 아니라 `200 {ok:true}` `[재현됨]`

- **축/항목**: B6
- **실측**: 7개 라우트 전부 200 응답

  | 요청 | 응답 |
  |---|---|
  | `PUT /api/categories/999999` | 200 |
  | `DELETE /api/categories/999999` | 200 |
  | `PUT /api/payment-methods/999999` | 200 |
  | `DELETE /api/installments/999999` | 200 |
  | `DELETE /api/revolving/999999` | 200 |
  | `DELETE /api/savings/999999` | 200 |
  | `DELETE /api/debts/999999` | 200 |

- **대조**: `transactions.js:403,414`와 `recurringRules.js:109,120`은
  `result.changes === 0`을 404로 올바르게 변환한다. **같은 코드베이스 안에서
  정책이 갈린다.**
- **영향**: 클라이언트가 "삭제 성공"으로 처리하고 UI에서 항목을 제거하므로,
  ID 불일치·경쟁조건을 사용자와 로그 어느 쪽에서도 감지할 수 없다.
- **분류**: 근본 시정조치 — `changes === 0 → 404` 규칙을 전 라우트에 통일.

### 4.6 [Medium] 전체 거래 삭제에만 확인 토큰이 없다 `[재현됨]`

- **축/항목**: A1, B6
- **위치**: `src/routes/transactions.js:282-285`
- **실측**: `DELETE /api/transactions {all:true}` → `200 {"ok":true,"deleted":1}`, total 1→0.
- **대조**: `POST /api/data/import`(overwrite)는 `confirm:"DELETE_ALL"`,
  `POST /api/export/settings/restore`는 `confirm:"OVERWRITE_SETTINGS"`를 요구한다
  (`data.js:124`, `export.js:190`). **가장 파괴적인 라우트만 무방비**다.
- **비고**: 클라이언트에 확인 다이얼로그(`ConfirmProvider`)가 있으나, 서버측
  방어가 아니다.
- **분류**: 즉시수정 — `confirm:"DELETE_ALL_TRANSACTIONS"` 요구.

### 4.7 [Medium] 할부 등록의 숫자 필드 미검증 `[재현됨]`

- **축/항목**: B6
- **위치**: `src/routes/installments.js:65-85`
- **실측**: `POST {total_amount:"X", months:"Y", monthly_amount:"Z", …}` → **HTTP 201**.
  저장된 행: `{"months":"Y","monthly_amount":"Z","remaining_months":0,"billed_months":7}`
- **원인**: `months < 2` 가드(`:74`)가 문자열 `"Y"`에 대해 `false`가 되어 통과한다.
  SQLite는 동적 타입이라 INTEGER 컬럼에 TEXT를 그대로 저장한다.
- **파급**: 이 값들은 `MONTHS_ELAPSED` 산술(`installments.js:12-16`)과 대시보드
  `installmentsDue` 합산(`utils/aggregation.js:16-24`)에 사용되므로,
  **대시보드의 "이번 달 청구액"과 "사용 가능 금액"이 조용히 틀어질 수 있다.**
- **분류**: 근본 시정조치 — `asInt()` 적용 + `months >= 2` 재검증.

### 4.8 [Medium] 사용자 입력 오류가 400이 아니라 500으로 응답된다 `[재현됨]`

- **축/항목**: B6 (OWASP Top10:2025 A10 — Mishandling of Exceptional Conditions)
- **실측**

  | 요청 | 실제 | 기대 |
  |---|---|---|
  | `POST /api/export/settings/restore` `{categories:"not-an-array"}` | **500** | 400 |
  | `POST /api/export/settings/restore` `{categories:[{id,name}]}` (필드 누락) | **500** | 400 |
  | `GET /api/transactions/suggest/merchants?limit=1.5` | **500** | 400 또는 클램프 |
  | `POST /api/savings/:id/mature` `{settle_date:"not-a-date"}` | **500** | 400 |
  | `POST /api/categories` (name 누락) | **500** | 400 |
  | `POST /api/payment-methods` (이름 중복 `'현금'`) | **500** | 409 |

- **위치**: `export.js:194`(존재 여부만 확인, 타입 미확인),
  `transactions.js:583`(`Number(req.query.limit) || 10` — 목록 라우트 `:47`의
  1~500 클램프가 여기엔 없음), `savings.js:79-83`, `categories.js:29-31`,
  `paymentMethods.js:25`
- **대조**: `revolving.js:68,99`는 UNIQUE 충돌을 409로 올바르게 변환한다.
- **영향**: 사용자가 원인을 알 수 없고(응답이 항상 `"Internal server error"`),
  서버 로그가 정상 입력 오류로 오염되어 진짜 장애 신호를 가린다.
- **분류**: 근본 시정조치 — 입력 검증을 응답 코드 정책과 함께 통일.

### 4.9 [Medium] 복잡도 리팩터링이 복잡도를 이동시켰을 뿐 감소시키지 않았다

- **축/항목**: B3
- **위치**: `src/routes/data.js:16-63` `resolveImportRow` — **CC 22, 코드베이스 최대**
- **경위**: 커밋 `5d34591`(refactor #148)이 `POST /import` 핸들러에서 이 함수를
  분리했다. 호출부는 CC 9로 내려갔으나 피호출부가 22로 남아, 함수 단위 기준
  ≤10을 여전히 두 배 이상 초과한다.
- **분류**: 개선권고 — 관심사 4개(형식 검증 / 카테고리 해석 / 레거시 판정 / FK 폴백)
  단위로 재분리.

### 4.10 [Medium-Low] a11y — 카테고리 필터 체크박스가 키보드·스크린리더로 조작 불가

- **축/항목**: A/B/C 축 외 (ISO 25010 사용성; 1차 감사 FND-21의 사각지대)
- **위치**: `client/src/pages/Transactions.jsx:282-285`
- **사실**: 체크박스에 `className="hidden"`이 적용돼 있다. 빌드된 CSS에서
  `.hidden{display:none}`임을 확인했다(`public/assets/index-*.css`).
  `display:none` 요소는 **포커스 불가이며 접근성 트리에서 제거된다.**
  감싸는 `<label>`에는 `tabindex`도 `role`도 없다.
- **영향**: 마우스 사용자만 카테고리 필터를 쓸 수 있다. WCAG 2.1.1(키보드) 위반.
- **경위**: 커밋 `996c84c`("fix(#151): 폼 입력요소 79개 전체에 접근성 라벨 부여")가
  **라벨 유무**를 기준으로 점검해, `<label>`로 감싸져 있는 이 요소는 통과 처리됐다.
  라벨은 있으나 **조작이 불가능**한 케이스다.
- **분류**: 개선권고 — `sr-only`(clip 방식)로 교체하거나 label에 키보드 핸들러 부여.

### 4.11 [Low] 그 외

| ID | 발견 | 위치 |
|---|---|---|
| R2-L1 | 임포트 시 `'미분류'` 카테고리 생성이 트랜잭션 **밖**에서 실행 — 롤백돼도 잔존 | `cardImport.js:95`(호출 `:102`) vs `db.transaction()` `:107`; `csvImport.js:47` vs `:51` |
| R2-L2 | `period-comparison`의 `date` 파싱이 `new Date(문자열)` = **UTC 자정** 기준. KST에서는 무해하나 UTC-오프셋 지역에서는 전날/전월로 밀린다. 코드베이스의 다른 모든 날짜 처리(FND-13/FND-20 시정)는 로컬 기준으로 통일돼 있어 이 지점만 예외 | `transactions.js:251` |
| R2-L3 | ESLint/Prettier/Sonar 설정 파일 0건. CI의 "Check JS syntax"는 `node --check`(구문 파싱)일 뿐 정적분석 아님 — 복잡도·중복도·코드스멜 자동 게이트 부재 | `.github/workflows/ci.yml` |
| R2-L4 | c8 커버리지 임계값(lines 75 / branches 65)이 루브릭 80%보다 낮게 설정 — 현재 CI가 루브릭 위반을 통과시킴 | `package.json:13` |
| R2-L5 | `IMPLEMENTATION_AUDIT.md`가 stale — 마이그레이션 체계(#89) 도입 후에도 "스키마 변경 로그 관리 방식 정리 필요"가 미결로 남음 | `docs/audit/IMPLEMENTATION_AUDIT.md` |
| R2-L6 | `utils/aggregation.js`가 `db/init`을 의존 — 이름은 util이나 실질은 리포지토리 | `src/utils/aggregation.js:2` |
| R2-L7 | `dataIntegrity.js`의 7개 점검이 각각 동일 쿼리를 samples용·count용으로 2회씩 실행 | `dataIntegrity.js:15-113` |

---

## 5. 권고 (ISO 9001 10.2 — 즉시수정 / 근본 시정조치 구분)

### 즉시수정 (correction) — 개별 결함 제거

| ID | 권고 | 대상 |
|---|---|---|
| C6-1 | `CREATE INDEX idx_tx_approval ON transactions(approval_number)` 마이그레이션 추가 | §4.1 |
| A1-1 | `DELETE /api/transactions {all:true}`에 확인 토큰 요구 | §4.6 |
| B6-1 | `debts.js`의 `balance`·`annual_rate`에 `asInt()` 적용 | §4.3 |
| B6-2 | `installments.js`의 금액·개월 필드에 `asInt()` 적용 + `months>=2` 재검증 | §4.7 |
| B6-3 | `suggest/merchants`의 `limit`에 목록 라우트와 동일한 정수 클램프(1~500) 적용 | §4.8 |
| B7-1 | `IMPLEMENTATION_AUDIT.md`의 마이그레이션 관련 항목 갱신 | §4.11 R2-L5 |
| A11y-1 | `Transactions.jsx`의 필터 체크박스를 `hidden` → `sr-only`로 교체 | §4.10 |

### 근본 시정조치 (corrective action) — 재발 구조 제거

| ID | 권고 | 근거 |
|---|---|---|
| **B6-4** | **입력검증을 라우트별 애드혹에서 스키마 선언 방식으로 전환.** 현재 `asInt()`를 "생각날 때 개별 필드에" 적용하는 방식이 §4.3(부채)·§4.7(할부)·§4.8(다수)의 공통 원인이다. 라우트별 필드 스키마를 선언하고 공통 미들웨어가 강제하면, "어느 필드에 검증을 빠뜨렸는가"라는 질문 자체가 사라진다 | TPS Poka-yoke — 애초에 결함이 불가능한 구조 |
| **B6-5** | **`changes === 0 → 404` 규칙을 전 라우트에 통일** | §4.5, 정책 일관성 |
| **A1-2** | **부작용 있는 GET 제거** — `completeExpiredInstallments()`를 조회 시점 계산(저장 없음)이나 명시적 POST 엔드포인트로 이관 | §4.2, HTTP 안전 메서드 계약 |
| **A4-1** | **`HOST`가 루프백이 아니면 기동 거부(또는 명시적 opt-in 요구).** A1·A4의 Partial 사유를 동시에 해소한다 | §3.1, Poka-yoke |
| **B1-1** | **클라이언트 테스트 인프라 도입**(Vitest + Testing Library). ※ 신규 의존성 추가이므로 **사전 승인 필요** | §4.4 |
| **B3-1** | **정적분석 도구(ESLint + 복잡도 규칙)를 CI 게이트로 편입.** 프레임워크 Part 3 운영규칙 3("사람이 재확인하지 않아도 되는 항목은 자동화로 이관", TPS Jidoka)의 직접 적용 대상이다 | §4.11 R2-L3 |
| **B1-2** | **c8 임계값을 루브릭 기준(80/80/80)까지 단계적으로 상향.** 현재 값(75/65)은 게이트가 기준보다 느슨해 통과가 준수를 뜻하지 않는다 | §4.11 R2-L4 |
| **B4-1** | 단독 메인테이너 구조에서 동료 리뷰를 대체할 자동 게이트 강화(위 B3-1/B1-2와 결합). ISO 9001 9.2의 독립성은 사람이 아니면 도구로 확보한다 | §3.2 B4 |
| **A7-1** | vendored `xlsx`의 CDN 최신판 확인을 **독립 주기**로 전환. 현재 트리거("Dependabot이 다른 취약점 PR을 열 때 김에")는 외부 사건에 종속돼 발동이 보장되지 않는다. 기존 `maintenance-audit.yml`(주간)에 체크 항목으로 추가하면 새 인프라 없이 해결된다 | §3.1 A7 |
| **C7-1** | 리렌더 계측 근거 확보 — 최소한 주요 페이지에 대한 Profiler 세션 1회 기록 | §3.3 C7 |

---

## 6. PDCA Check — 1차 사이클 대비 평가

프레임워크 Part 3의 Check 단계(직전 감사 대비 비교, 근본원인분석)에 해당한다.

### 6.1 개선 확인

표본 검증한 범위에서 1차 리메디에이션은 실제로 코드에 반영돼 있었다.

| 1차 발견 | 재확인 결과 |
|---|---|
| FND-01 (CSRF 방어 전무) | ✅ `csrfGuard` 동작 실측 확인 (cross-site 403 / same-origin 201) |
| FND-04 (보안헤더 전무) | ✅ 헤더 4종 응답 실측 확인 |
| FND-07 (cashflow N+1) | ✅ 단일 쿼리 + JS 합산으로 전환, `EXPLAIN` 확인 |
| FND-08 (비sargable WHERE) | ✅ 범위 비교로 전환, `idx_tx_date` 사용 확인 |
| FND-10 (`/api/*` SPA 폴백) | ✅ 404 JSON 실측 확인 |
| FND-13 (중복 헬퍼) | ✅ 중복률 1.97%로 기준 내 |
| FND-15 (에러 바운더리 부재) | ✅ `ErrorBoundary` + 전역 에러 미들웨어 확인 |
| FND-22 (코드스플리팅) | ✅ 빌드 청크 산출물로 확인 |

### 6.2 재발/불완전 시정 — 이번 사이클의 핵심 학습

**두 가지 패턴이 반복됐다.**

**패턴 1 — 시정 범위가 진단 범위보다 좁다.**
FND-06(숫자 필드 미검증)의 시정 커밋 `0cc89f8`은 커밋 메시지에 "리볼빙/부채/백업임포트"를
명시했으나, 실제로는 `revolving.js`만 필드 전수 검증을 도입했고 `debts.js`는
한 곳, `installments.js`는 아예 대상에서 빠졌다. 결과적으로 1차 감사가 지적한
것과 **문자 그대로 동일한 오염**이 지금도 재현된다(§4.3, §4.7).

> **근본원인**: 시정 완료 판정 기준이 "지적된 증상이 사라졌는가"였고
> "같은 결함 유형이 코드베이스 전체에서 사라졌는가"가 아니었다.
> Six Sigma의 Control 단계가 없는 상태 — 즉, 시정이 표준화·자동검증으로
> 이관되지 않고 1회성 패치로 끝났다.
> → 권고 **B6-4**(스키마 선언 검증)와 **B3-1**(정적분석 게이트)이 이 원인을 겨냥한다.
>
> **[후속 정정]** 위 근본원인 서술은 원인의 소재를 개발팀 쪽으로 좁게 잡은 것으로,
> 후속 심층 분석([`REMEDIATION_RCA_2026-07-R2.md`](./REMEDIATION_RCA_2026-07-R2.md) §1.2)에서
> 부정확함이 확인됐다. 1차 감사 FND-06의 **위치** 항목이 인용한 곳은
> `revolving.js:39,59`·`debts.js:78`·`data.js` 뿐이고 `POST /api/debts`는
> **1차 감사가 보지 않았다.** 이슈 #142의 완료 기준은 그 목록의 충실한 전사이며,
> 개발팀은 완료 기준을 정확히 이행했다. 즉 **시정은 진단에 충실했고 진단이 불완전했다** —
> 근본원인은 감사·시정 **양쪽 모두 "결함 유형 전수조사" 단계를 갖고 있지 않다는
> 공정상의 공백**이다. 상세 분석과 재발 방지책은 위 후속 문서를 참조할 것.

**패턴 2 — 시정이 새로운 유형의 결함을 만들었다.**

- `#121`(할부 자동완료) → **부작용 있는 GET**이 생겨 CSRF 방어를 우회하는
  쓰기 경로가 만들어졌다(§4.2).
- `#148`(복잡도 리팩터링) → 복잡도가 **감소가 아니라 이동**해, 추출된 함수가
  코드베이스 최고 CC 22가 됐다(§4.9).
- `#151`(a11y 라벨) → 라벨은 부여됐으나 `display:none` 요소의 **조작 불가**는
  점검 기준에 없어 남았다(§4.10).

> **근본원인**: 리메디에이션 PR에 대한 독립 검증이 "지적 사항이 처리됐는가"에
> 머물렀고, "처리 과정에서 새 결함이 생기지 않았는가"를 묻지 않았다.
> ISO/IEC 12207의 검증(verification)은 변경 자체도 대상으로 삼는다.
> → 리메디에이션 PR을 일반 PR과 동일한 감사 대상으로 취급할 것을 권고한다.

### 6.3 Kaizen 지표 — Pass 비율 추이

프레임워크 Part 3 운영규칙 5는 "Part 2 루브릭의 Pass 비율 추이"를 핵심 지표로
추적할 것을 요구한다.

> **[정정]** 본 절의 초판은 "1차 감사가 동일 형식의 집계를 제시하지 않아 비교 가능한
> 기준선이 없다"고 서술했으나 **사실과 다르다.** 1차 보고서 §6.2에 추적 지표 표가 있고
> Pass 비율 19.0%(4/21)·Fail 7이 명시돼 있다. 아래 표를 그에 맞춰 정정했다.

| 사이클 | Pass | Partial | Fail | Pass 비율 |
|---|---:|---:|---:|---:|
| 1차 (2026-07 사이클1) | 4 | 10 | 7 | 19.0% |
| 2차 (R2, 본 보고서) | 11 | 10 | 0 | **52.4%** |

**Pass 비율 19.0% → 52.4%, Fail 7 → 0.** M0~M5 리메디에이션의 효과가 루브릭
수준에서 확인된다. 본 보고서의 수치를 2차 기준선으로 삼고 3차부터 추이를 이어간다.

측정 가능한 정량 기준선도 함께 고정한다. 1차 대비 비교가 가능한 항목은 병기하되,
**측정 방법이 다르면 그 사실을 명시**한다(같은 방법으로 잰 값이 아니면 추세로 읽을 수 없다).

| 지표 | 1차 (사이클1) | R2 실측값 | 비교 가능성 |
|---|---|---|---|
| Pass 비율 | 19.0% (4/21) | **52.4% (11/21)** | ✅ 동일 루브릭 |
| Fail 항목 수 | 7 | **0** | ✅ |
| 백엔드 라인 커버리지 | 78.11% (4개 파일 한정) | **81.38%** (전체) | ⚠️ 계측 범위 상이 |
| 백엔드 브랜치 커버리지 | — | 73.93% | — |
| 클라이언트 커버리지 | 0% | **0%** (테스트 부재) | ✅ 변화 없음 |
| 코드 중복률(전체) | 8.48% (방법 미상) | **1.97%** (Type-1 클론) | ⚠️ 방법 상이 — 동일 도구로 재측정 시 3.02% → 1.97% |
| CC>10 함수 비율 | 17.0% (근사, **재현되지 않음**) | **3.4%** (8/237, AST 실측) | ❌ 1차 수치 재현 불가 — 동일 도구로 재측정 시 **3.4% → 3.4%(불변)** |
| 최대 CC | 43 (근사, 재현되지 않음) | 22 | ❌ 동일 도구 재측정 시 23 → 22 |
| 순환 의존성 | 0건 | **0건** | ✅ |
| npm audit High 이상 | — | **0건** | — |
| API p95 최댓값 | — | 327.5ms @200k건 (기준 800ms) | — |
| LCP / CLS | — | 1,045ms / 0.000 | — |
| PR churn 중앙값 | 71줄 | **87줄** | ✅ 둘 다 400줄 기준 충족 |

> **CC 지표 주의**: 1차의 "17.0%, 최대 43"은 본 감사의 AST 기반 McCabe 측정으로
> 재현되지 않는다(동일 커밋 재측정 시 백엔드 205개 중 7개 = 3.4%, 최대 23).
> 따라서 "17.0% → 3.4%"를 개선으로 읽어서는 안 된다 — 동일 도구 기준으로는
> **리메디에이션 전후가 3.4%로 동일**하다. 근거와 파급은
> [`REMEDIATION_RCA_2026-07-R2.md`](./REMEDIATION_RCA_2026-07-R2.md) §5.5 참조.

---

## 7. 감사의 한계 (불확실성 표기)

본 보고서의 판정을 해석할 때 다음 제약을 함께 고려해야 한다.

1. **성능 측정은 단일 머신 로컬 환경이다.** 서버·클라이언트·DB가 모두 같은
   호스트의 로컬 디스크에 있다. 네트워크 지연·디스크 경합이 있는 환경에서는
   결과가 달라진다. 다만 이 앱의 배포 형태 자체가 로컬이므로 측정 조건은
   실사용 조건과 일치한다. **확신도 높음.**
2. **C1~C3은 대시보드 1개 페이지만 측정됐다.** 앱에 라우터가 없어 다른 9개
   페이지는 URL로 직접 진입할 수 없다. `Settings.jsx`(1,032줄)나
   `Transactions.jsx`의 로딩 패턴은 **검증되지 않았다.** C1/C3의 Pass는
   대시보드에 한정된 판정이다. **확신도 중간(측정 범위 한정).**
3. **순환복잡도는 백엔드(`src`, `migrations`, `scripts`)만 AST 기반으로 측정했다.**
   JSX 파서를 오프라인에서 확보할 수 없어(신규 의존성 설치는 감사 범위 밖으로 판단)
   클라이언트 CC는 산출하지 않았다. B3 판정은 백엔드 기준이며,
   `Settings.jsx`(1,032줄) 등에 추가 초과 함수가 있을 가능성을 배제할 수 없다.
   **확신도 중간.**
4. **중복률은 정확 일치(exact clone, Type-1) 기준이다.** 변수명만 다른
   Type-2/3 클론은 잡히지 않으므로, SonarQube 실측값은 본 보고서의 1.97%보다
   높게 나올 수 있다. **확신도 중간(과소추정 방향).**
5. **PR 리뷰 응답시간(B4의 "1영업일 이내")은 측정하지 않았다.** GitHub API
   접근 없이 로컬 git 이력만으로는 리뷰 타임스탬프를 알 수 없고, self-merge
   구조에서는 지표 자체의 의미가 약하다. B4 판정은 PR 크기와 프로세스 인프라에
   근거한다. **확신도 중간.**
6. **`npm audit` 결과는 레지스트리 어드바이저리 시점에 종속된다.** 특히
   벤더링된 `xlsx`(`file:` 의존성)는 스캔 대상이 아니므로, A7의 Pass가
   해당 패키지의 안전을 보장하지 않는다(§3.1 A7). **확신도 — 사각지대 명시적 존재.**
7. **감사 시점에 병행 개발세션이 같은 저장소에서 작업 중이었다.** 코드 기준
   시점을 `78cf793`으로 고정하고 별도 워크트리에서 감사했으므로 판정 자체는
   유효하나, 그 이후 커밋은 반영되지 않았다.

---

## 부록 A. 감사 재현 방법

본 보고서의 모든 수치는 다음으로 재현 가능하다.

```bash
# 커버리지 (§3.2 B1)
npm run test:coverage

# 의존성 취약점 (§3.1 A7)
npm audit --json            # root
cd client && npm audit --json

# 번들/코드스플리팅 (§3.3 C7)
cd client && npm run build

# Web Vitals (§3.3 C1~C3)
npm run perf:baseline

# 순환복잡도 / 중복률 / API p95 / EXPLAIN / PoC 13건
#   → 감사 세션에서 작성한 일회성 계측 스크립트로 측정.
#     보고서 본문에 실행계획·측정값 원문을 그대로 인용했다.
```

## 부록 B. PoC 실행 결과 원문 요약

| ID | 항목 | 결과 |
|---|---|---|
| R2-01 | GET /api/installments 의 DB 쓰기 | **CONFIRMED** — cross-site GET 1회로 `진행중`→`완료` |
| R2-02 | POST /api/debts 금액 미검증 | **CONFIRMED** — `total_balance="0abc1000"` (string) |
| R2-03 | POST /api/installments 금액 미검증 | **CONFIRMED** — HTTP 201, `months:"Y"` 저장 |
| R2-04 | savings/:id/mature settle_date 미검증 | HTTP 500 |
| R2-05 | settings/restore 페이로드 타입 미검증 | **CONFIRMED** — 두 케이스 모두 500 |
| R2-06 | suggest/merchants limit 미검증 | `limit=1.5` → 500 |
| R2-07 | DELETE {all:true} 확인 토큰 부재 | **CONFIRMED** — 200, total 1→0 |
| R2-08 | 없는 리소스 PUT/DELETE | **CONFIRMED** — 7개 라우트 전부 200 |
| R2-09 | csrfGuard 차단 동작 | **PASS** — 403 / 201 / (비브라우저) 201 |
| R2-10 | 보안 헤더 | **PASS** — 4종 전부 존재, `X-Powered-By` 없음 |
| R2-11 | API 404 + 에러 은닉 | **PASS** — 404 JSON, 400 메시지 정상 |
| R2-12 | period-comparison date 파싱 | KST 무해, 타 TZ 밀림 가능 |
| R2-13 | 필수값 누락·UNIQUE 충돌 | 3케이스 모두 500 |

---

**보고 대상**: 프레임워크 Part 3 운영규칙 4에 따라 경영검토에 준하는 의사결정권자.
**감사팀 입장**: 본 보고서는 판정과 권고만 담는다. 코드 수정·PR 생성은 수행하지 않았다.
