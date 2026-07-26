# finance-tracker 독립 코드 감사 프레임워크

**대상**: finance-tracker (개인 가계부 웹앱 — Node/Express 백엔드, React/Vite 프론트엔드, SQLite)
**성격**: 개발팀과 조직적으로 분리된 독립 감사팀이 사용할 기준/체크리스트/프로세스. 실제 코드 감사 결과가 아니라, 그 감사의 근거가 되는 표준 문서 리서치 + 통합 프레임워크.
**작성일**: 2026-07-25

---

## 0. 프레임워크 설계 원칙

독립 감사팀의 존재 근거는 ISO/IEC 12207이 정의하는 검증(verification)/확인(validation)이 "획득자·공급자 또는 독립 제3자"에 의해 수행될 수 있다는 조항과, ISO 9001 조항 9.2(내부감사)의 "감사자는 자신의 업무를 감사하지 않는다"는 원칙에 근거한다. 이 문서는 3개 층위로 구성된다.

1. **표준별 요약 + 체크리스트 후보** — 17개 표준/방법론 개별 조사
2. **통합 감사 루브릭** — 보안 / 코드품질 / 성능 3대 축으로 재편, 각 항목에 표준 근거 명시
3. **메타 프로세스** — PDCA/Kaizen 기반 감사 사이클 자체의 지속개선 구조

---

## Part 1. 표준별 핵심 개념 및 체크리스트 후보

### 1.1 소프트웨어 품질 표준

#### ISO/IEC 25010 (SQuaRE 제품 품질 모델)

ISO/IEC 9126 후속 표준으로, 제품 품질을 8대 특성·31개 하위특성으로 정의한다: 기능적합성(Functional Suitability), 성능효율성(Performance Efficiency), 호환성(Compatibility), 사용성(Usability), 신뢰성(Reliability), 보안성(Security), 유지보수성(Maintainability), 이식성(Portability).

| 특성 | finance-tracker 체크 항목 |
|---|---|
| 기능적합성 | 거래/예산/합계 계산 로직의 요구사항 커버리지, 음수·0원·미래날짜 등 엣지케이스 처리 |
| 성능효율성 | SQLite 쿼리 N+1/인덱스 누락, 대량 거래 페이지네이션, React 불필요 리렌더링 |
| 호환성 | SQLite 파일 동시접근 락 처리, CSV/OFX 임포트·익스포트 포맷, API 스키마 버전 호환 |
| 사용성 | 폼 검증 UX, a11y 속성, 반응형 레이아웃 |
| 신뢰성 | DB 트랜잭션(BEGIN/COMMIT/ROLLBACK), 크래시 복구, 에러 바운더리 |
| 보안성 | 비밀번호 해싱, SQL 인젝션/XSS/CSRF 방어, 전송 구간 암호화 |
| 유지보수성 | 계층 분리, 순환 의존성, 테스트 커버리지, 코드 중복도 |
| 이식성 | Node 버전 고정, 환경변수 기반 설정, DBMS 마이그레이션 용이성 |

출처: [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) · [ISO OBP 원문](https://www.iso.org/obp/ui/#iso:std:iso-iec:25010:ed-1:v1:en) · [arc42 Quality Model 요약](https://quality.arc42.org/standards/iso-25010)

#### ISO/IEC/IEEE 12207:2026 (소프트웨어 생명주기 프로세스)

계약 프로세스·조직 프로젝트 가능화 프로세스·기술관리 프로세스·기술 프로세스 4개 그룹으로 구성. 2026년판(2017년판 대체)은 애자일/반복 개발, 기술관리 강화, 변경통제 개선을 반영했다. 독립 감사팀의 근거는 여기서 나온다 — 검증/확인이 제3자에 의해 수행 가능하다는 명시.

체크 항목: 요구사항·설계·테스트 계획 등 산출물의 존재 및 추적성(traceability), 형상관리 프로세스(Git 브랜치 전략·PR 리뷰 이력·릴리즈 태깅), 검증/확인이 개발자 자체 테스트가 아닌 독립 단계를 거쳤는지.

출처: [ISO/IEC/IEEE 12207:2026 (ISO 공식)](https://www.iso.org/standard/90219.html) · [ANSI Blog 요약](https://blog.ansi.org/ansi/iso-iec-ieee-12207-2026-software-life-cycle/) · [ISO OBP 원문](https://www.iso.org/obp/ui/en/#!iso:std:90219:en)

#### CMMI V3.0

5단계 성숙도(Initial→Managed→Defined→Quantitatively Managed→Optimizing). finance-tracker 규모에는 Level 3(Defined, 표준화된 프로세스 문서화) 수준을 감사 기준으로 삼는 것이 현실적이다.

체크 항목(관련 Practice Area만 선별): 요구사항 개발/관리(RDM) — 요구사항 문서화·변경이력 추적; 검증/확인(VV) — 독립적 요구사항 충족 검증; 형상관리(CM) — 소스코드/스키마/설정파일 버전관리 및 변경승인.

출처: [CMMI Model Quick Reference Guide V3.0 (PDF)](https://processgroup.com/CMMI-Model-Quick-Reference-Guide_Digital-1024.pdf) · [Capability Maturity Model Integration — Wikipedia](https://en.wikipedia.org/wiki/Capability_Maturity_Model_Integration)

### 1.2 보안 감사 표준

#### OWASP ASVS 5.0.0 (2025-05-30 릴리스)

17개 챕터(V1~V17), 약 350개 요구사항. Level 1(자동화 가능 최소 기준)/Level 2(표준 감사 레벨)/Level 3(고위험). 금전 데이터를 다루는 finance-tracker는 최소 **Level 2** 적용 권장.

| 카테고리 | 체크 항목 |
|---|---|
| 인증 | bcrypt/argon2 해싱, rate limiting, 세션 고정 방지, MFA 유무 |
| 세션 관리 | 쿠키 HttpOnly/Secure/SameSite, 로그인 시 토큰 회전, 로그아웃 시 서버측 무효화 |
| 접근 통제 | 사용자 ID 기반 데이터 필터링(IDOR 방지), 관리자/일반 권한 분리 |
| 입력검증/인코딩 | Prepared statement, `dangerouslySetInnerHTML` 사용 여부, 경로 조작 방지 |
| 데이터 보호 | SQLite 파일 암호화, HTTPS 강제, `.env` 커밋 여부 |
| 에러/로깅 | 스택트레이스 노출 여부, 인증실패 로깅, 로그 내 민감정보 |
| 설정 | Helmet 헤더, CORS 화이트리스트, 프로덕션 디버그 비활성화 |

출처: [OWASP ASVS 프로젝트](https://owasp.org/www-project-application-security-verification-standard/) · [ASVS v5.0.0 (GitHub)](https://github.com/OWASP/ASVS/tree/v5.0.0)

#### OWASP Top 10:2025

2021년 이후 첫 개정(2025-11 발표, 2026-01 최종화). A01 Broken Access Control(1위 유지, finance-tracker 최우선), A02 Security Misconfiguration(5위→2위), A03 Software Supply Chain Failures(신규), A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software/Data Integrity Failures, A09 Logging/Alerting Failures, A10 Mishandling of Exceptional Conditions(신규).

출처: [OWASP Top 10:2025](https://owasp.org/Top10/2025/) · [Introduction](https://owasp.org/Top10/2025/0x00_2025-Introduction/)

#### CWE/SANS Top 25 (2025년판, 2025-12 발표)

1위 CWE-79(XSS), 2위 CWE-89(SQL Injection), 3위 CWE-352(CSRF), 4위 CWE-862(Missing Authorization), 5위 CWE-787(Out-of-bounds Write). Node/Express/SQLite 스택 매핑: CWE-89(쿼리 문자열 결합), CWE-79(React 출력 이스케이핑), CWE-352(CSRF 토큰), CWE-862/284(인가 미들웨어), CWE-22(경로 조작), CWE-798(하드코딩 크레덴셜), CWE-639(사용자 제어 키를 통한 인가 우회, 예: `/api/transactions/:id`).

출처: [2025 CWE Top 25 (CISA)](https://www.cisa.gov/news-events/alerts/2025/12/11/2025-cwe-top-25-most-dangerous-software-weaknesses) · [CWE Top 25 — 2025 (MITRE)](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html)

### 1.3 제조업 뿌리 품질관리 표준

#### ISO 9001:2015

PDCA와 리스크 기반 사고를 QMS 근간으로 명시. 조항 9.2(내부감사) — 계획된 주기의 독립적 준수 확인; 조항 10.2(부적합/시정조치) — 즉각 수정(correction)과 근본원인 기반 시정조치(corrective action)를 구분; 조항 10.3(지속적 개선).

체크 항목: 문서화된 코딩표준/리뷰절차 존재 여부, 결함을 즉시수정 vs 근본원인 시정조치로 구분 기록, 감사 주기 및 경영검토 반영 여부.

출처: [ISO 9001:2015](https://www.iso.org/standard/62085.html) · [Clause 9.2 Internal audit](https://davidbarker.consulting/iso9001/clause-9-2-internal-audit/) · [Clause 10.2](https://www.thecoresolution.com/clause-10-2-iso-90012015-explained)

#### Lean Software Development (Poppendieck, 2003)

TPS 낭비제거 원칙의 소프트웨어 이식. 7원칙: 낭비 제거, 학습 증폭, 결정 지연, 신속 인도, 팀 권한 위임, 품질 내재화, 전체 최적화. 제조업 7낭비 → 소프트웨어 매핑: 재고→미완성 작업, 과잉생산→불필요 기능, 재작업→재학습, 이동→인계, 대기→지연, 불량→결함, 과잉가공→작업전환.

체크 항목: 방치된 브랜치/기능플래그(미완성 작업), 미사용 과잉 기능(YAGNI 위반), 반복되는 유사 버그(재학습 미흡), 테스트가 사후가 아닌 개발과정에 통합되었는지(품질 내재화).

출처: [Lean Software Development — Poppendieck](https://inigomedina.co/library/work/poppendieck-lean-software-development) · [7 Wastes of Software Development](https://medium.com/@techworldwithmilan/7-wastes-of-software-development-8febe264c5a8)

#### Six Sigma — DMAIC

Define-Measure-Analyze-Improve-Control. 감사 프로세스 자체를 DMAIC 구조로 설계 가능: Define(감사범위·기준), Measure(결함밀도·커버리지·정적분석 경고수), Analyze(근본원인·파레토 분석), Improve(리팩토링 권고), Control(재발방지 게이트·모니터링).

출처: [Six Sigma — ASQ](https://asq.org/quality-resources/six-sigma) · [Lean Six Sigma 결함추적 사례 — ASQ](https://asq.org/quality-resources/articles/case-studies/using-lean-six-sigma-to-reduce-effort-and-cost-in-a-software-defect-tracking-system?id=9a1ce9dcacf0452fac6753af9904aebc)

#### TQM (전사적 품질관리)

고객중심·전직원참여·프로세스개선·데이터기반 의사결정·리더십·지속개선. 코드 품질을 QA만이 아닌 전 개발자의 책임으로 규정(코드리뷰 문화), 감사 결과를 정성적 인상이 아닌 정량 지표로 보고.

출처: [Total Quality Management — ASQ](https://asq.org/quality-resources/total-quality-management)

#### PDCA / Kaizen (Deming Cycle) — 메타 프로세스의 핵심 근거

1920년대 Shewhart 창안, Deming이 발전시켜 일본에 전파. Plan(현상평가·개선안) → Do(실행) → Check(전후 데이터 비교) → Act(성공 시 표준화, 실패 시 재계획). Kaizen은 이를 실행하는 더 넓은 지속적·점진적 개선 철학. ISO 9001 9.2/10.2/10.3, Six Sigma의 Improve-Control, TQM의 지속개선을 하나로 묶는 순환 거버넌스 구조로 기능한다. → **Part 3에서 상세 설계**.

출처: [PDCA Cycle — ASQ](https://asq.org/quality-resources/pdca-cycle) · [PDCA — lean.org Lexicon](https://www.lean.org/lexicon-terms/pdca/)

#### 도요타 생산방식(TPS)의 소프트웨어 적용

Jidoka(自働化, 이상 발생 시 자동 정지) → CI/CD에서 테스트 실패/정적분석 오류 시 빌드 자동 중단(Quality Gate)으로 구현. Poka-yoke(오류방지) → 타입 시스템·스키마 검증·계약 기반 입력검증으로 "애초에 결함 불가능한 구조"(예: 금액 계산에 부동소수점 대신 Decimal/정수 강제). Kanban → PR/브랜치 WIP 제한, 미병합 변경사항 적체 여부.

출처: [Jidoka — Toyota UK](https://mag.toyota.co.uk/jidoka-toyota-production-system/) · [Poka Yoke — Kanban Zone](https://kanbanzone.com/resources/lean/toyota-production-system/poka-yoke/)

### 1.4 실무 코드품질/성능 감사 프레임워크

#### SonarQube "Sonar way" Quality Gate

신규 코드(New Code)에만 적용: Reliability/Security/Maintainability 등급 A(고정), 신규 코드 커버리지 ≥ 80%, 중복률 ≤ 3%, 모든 신규 Security Hotspot 검토 완료. Cognitive Complexity 기본 임계값 15, Cyclomatic Complexity 관행상 함수당 10 상한.

출처: [Quality Gates — SonarQube Server](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction-to-quality-gates) · [Metric definitions](https://docs.sonarsource.com/sonarqube-server/10.4/user-guide/metric-definitions)

#### Google Engineering Practices

CL(변경단위) 100줄 내외 이상적, 리뷰 응답 1영업일 이내. 리뷰 관점 9축: Design/Functionality/Complexity/Tests/Naming/Comments/Style/Consistency/Documentation.

출처: [What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html) · [Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)

#### Microsoft 엔지니어링 프랙티스

Code-With-Engineering Playbook: 팀 단위 리뷰 SLA(예: 24시간), PR은 작은 단위로. 400줄 미만 PR에서 리뷰 품질 최고, 리뷰된 코드는 프로덕션 결함 20~30% 감소(사내 데이터).

출처: [Reviewer Guidance — Engineering Fundamentals Playbook](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/process-guidance/reviewer-guidance/)

#### Core Web Vitals

LCP: Good <2.5s / Poor >4.0s. INP: Good <200ms / Poor >500ms. CLS: Good <0.1 / Poor >0.25. p75 RUM 기준 판정.

출처: [Core Web Vitals thresholds — web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)

#### API 응답시간 SLA 관행

평균 대신 p95/p99 percentile 사용 권장(Google SRE 계열). 내부 SLO는 대외 SLA보다 20~40% 타이트하게 설정하는 관행. AWS Well-Architected는 절대 수치보다 지속 모니터링+캐싱/오토스케일링 등 프로세스적 접근 권장.

출처: [Google SRE Workbook](https://sre.google/workbook/index/) · [AWS Well-Architected — Performance Efficiency](https://docs.aws.amazon.com/wellarchitected/latest/framework/perf-dp.html)

---

## Part 2. 통합 감사 체크리스트/루브릭 (보안 / 코드품질 / 성능)

### 판정 규칙 — 척도와 위협모델 예외 처리

판정 척도: **Pass**(기준 충족) / **Partial**(부분 충족, 개선권고) / **Fail**(미충족, 시정조치 필수) — ISO 9001 조항 10.2의 부적합(Nonconformity) 판정 구조를 따른다. **이 셋이 척도의 전부이며 `N/A`는 사용하지 않는다.**

#### 왜 N/A를 두지 않는가

finance-tracker는 `docs/ARCHITECTURE.md`가 "단일 사용자 전용, 인증 없이 로컬에서 독립 실행"을 설계 전제로 명시한 앱이라, A1(IDOR)·A4(인증)·A6(전송 암호화)처럼 **위협모델상 전제가 성립하지 않는 항목**이 존재한다. 이런 항목을 `N/A`로 처리하려는 유인이 크지만, 2026-07 사이클에서 두 가지 폐해가 실제로 관측됐다.

1. **집계가 깨진다.** Part 3 운영규칙 5는 "Pass 비율 추이"를 핵심 지표로 요구하는데, `N/A`가 분모에서 빠지면 사이클마다 분모가 달라져 추이 비교 자체가 성립하지 않는다. 2라운드 자체평가(PR #187)가 21항목을 `Pass 13 / Fail 3 / 미측정 1 / N/A 2 / 보류 1`로 쪼갠 뒤 **Pass 비율을 산출하지 못했고**, 1차 감사가 남긴 기준선(Pass 19.0%)과 이어지지 않았다.
2. **항목 내 실제 결함을 은폐한다.** 루브릭 한 항목은 대개 여러 하위 위협을 묶는다. `N/A`는 "이 항목에 볼 것이 없다"로 읽히므로, 그중 **여전히 해당되는 하위 위협의 미충족**이 판정에서 사라진다. 실제로 A1을 `N/A`로 처리한 자체평가에서, 같은 항목에 속하는 **부작용 있는 GET의 CSRF 우회**(`AUDIT_REPORT_2026-07-R2.md` §4.2, 이슈 #205)와 **전체 삭제 라우트의 확인 토큰 부재**(§4.6)가 판정에 전혀 반영되지 않았다.

> 이 판정은 교차검토를 거쳐 **양측 합의로 Partial로 정정됐다**([`PDCA_CROSS_REVIEW_ROUND2.md`](./PDCA_CROSS_REVIEW_ROUND2.md) §1 — "A1은 Partial로 정정한다. `N/A`는 '이 앱 특성상 이 축을 평가할 필요가 없다'는 뜻인데, 실제로는 '평가했더니 통제가 없다'는 걸 발견하고도 위협모델 자체를 좁게 잡아 회피한 셈이다"). 본 규칙은 그 합의를 절차로 고정해, 같은 판단을 매번 사람이 다시 내리지 않아도 되게 하는 것이 목적이다.

따라서 위협모델 미해당은 **별도 카테고리가 아니라, Pass/Partial 판정에 흡수되는 절차**로 다룬다.

#### 위협모델 예외(threat-model exemption) 절차

**규칙 1 — 하위 요소 단위로 적용한다.**

예외는 항목 전체가 아니라 **통과기준의 하위 요소 단위**로 적용한다. 항목의 하위 요소 중 하나라도 (a) 위협모델상 여전히 해당되고 (b) 미충족이면, 그 항목의 판정은 Partial 이하다.

**규칙 2 — 전제의 강제 여부가 Pass와 Partial을 가른다.**

| 전제의 보장 수단 | 나머지 하위 요소 | 판정 |
|---|---|---|
| 코드·설정으로 **강제됨**(기동 거부, 스키마 제약, 타입 시스템, CI 게이트 등) | 충족 | **Pass (위협모델 예외)** |
| 코드·설정으로 강제됨 | 미충족 있음 | **Partial** |
| **문서·관행으로만 존재** | 무관 | **Partial** |
| 전제가 실제로 깨져 있음이 실증됨 | — | **Fail** |

근거: "설계상 해당 없음"과 "아직 문제가 드러나지 않았을 뿐"을 구분하는 **유일하게 관찰 가능한 차이는 전제가 강제되는지 여부**다. 문서로만 존재하는 전제는 설정 한 줄로 무너지고, 그 순간 해당 항목의 위협이 즉시 되살아난다. TPS의 Poka-yoke(애초에 결함이 불가능한 구조)와 같은 판단이다.

**규칙 3 — 예외를 적용하면 근거란에 3요소를 반드시 적는다.**

1. **배제되는 위협** — 한 문장으로
2. **배제를 보장하는 것** — 코드·설정 위치(강제되는 경우) 또는 문서 위치(문서로만 존재하는 경우). **어느 쪽인지 명시할 것**
3. **전제가 깨지는 조건** — 언제 이 판정을 재검토해야 하는가

3번이 없는 예외는 **무효로 본다.** 재평가 시점이 명시되지 않은 예외는 사실상 영구 면제가 되기 때문이다.

**규칙 4 — 예외 대장(Exception Register)을 유지한다.**

예외를 적용한 항목은 보고서에 별도 표로 모은다. 이 표는 다음 사이클 Plan 단계의 **필수 입력**이며, 전제 조건을 바꾸는 변경이 계획되면 해당 항목은 **자동으로 재판정 대상**이 된다. finance-tracker에서 그 트리거는 **서비스화(멀티유저·네트워크 노출)** 이고, 이슈 #189(인증/세션 설계 ADR)가 그 시점의 결정 창구다.

| 항목 | 배제되는 위협 | 보장 수단(위치) | 강제 여부 | 재평가 트리거 |
|---|---|---|---|---|
| A1-IDOR | 타 사용자 거래내역 접근 | `docs/ARCHITECTURE.md`(단일 사용자 전제) | **문서** | 다중 사용자 모델 도입(#189) |
| A4 | 인증·세션 관리 | `docs/ARCHITECTURE.md` + `src/server.js:71` 기본 바인딩 | **문서**(기본값만, 강제 아님) | 비루프백 바인딩 또는 #189 |
| A6-HTTPS | 전송 구간 도청 | 루프백 전용 서빙 | **문서**(기본값만) | 비루프백 바인딩 또는 #189 |

**규칙 5 — 집계는 분모를 고정하고, 예외 비율을 견제 지표로 병기한다.**

- Pass 비율의 **분모는 항상 21**(전체 루브릭 항목 수)이다. 예외 항목을 분모에서 빼지 않는다.
- 예외로 Pass가 된 항목은 표기상 `Pass(예외)`로 구분하되 Pass 집계에는 포함한다.
- **동시에 아래 세 지표를 나란히 보고한다.**

| 지표 | 정의 |
|---|---|
| Pass 비율 | (Pass + Pass(예외)) / 21 |
| **실질 Pass 비율** | Pass / 21 (예외 제외) |
| **예외 비율** | Pass(예외) / 21 |

**실질 Pass 비율이 정체된 채 Pass 비율만 오르면 그것은 개선이 아니라 예외의 확대다.** 이 견제 지표가 없으면 예외 절차 자체가 판정을 무르게 만드는 통로가 된다.

**규칙 6 — 예외는 사이클 한정이다.**

예외는 그 사이클에만 유효하다. 다음 사이클은 전제가 여전히 성립하는지 **다시 확인한 뒤** 예외를 재적용한다. 직전 사이클의 예외를 근거로 이번 사이클을 판정하지 않는다 — 그렇게 하면 예외가 검증 없이 영속화되고, 감사는 직전 결과의 복사본이 된다.

> 같은 위험이 예외 밖에서도 관측됐다: 2라운드 자체평가의 C6 `Pass` 근거가 "직전 감사가 지적한 FND-07/08이 완료됨"이었는데, 그 목록 **밖**의 인덱스 누락(`transactions.approval_number`, `AUDIT_REPORT_2026-07-R2.md` §4.1)은 구조적으로 보이지 않았다. 직전 결과를 체크리스트로 삼으면 그 목록이 곧 시야의 경계가 된다.

**규칙 7 — 판정 기준의 정본은 Part 2 통과기준이다.**

Part 1의 표준별 체크 항목은 **조사 배경이자 후보 목록**이며 판정에 직접 쓰지 않는다. 두 곳의 요구가 다르면 Part 2를 따른다. Part 1에만 있는 항목을 판정 근거로 삼으려면 먼저 Part 2 통과기준에 반영하는 개정을 거친다.

> 2라운드에서 A6의 SQLite 파일 암호화를 두고, 자체평가는 Part 1 ISO 25010 표의 "SQLite 파일 암호화"를 근거로 **Fail**을, 독립 감사는 Part 2 통과기준 3개 중 2개 충족을 근거로 **Partial**을 냈다. 어느 쪽도 오독이 아니었고 루브릭이 두 층위에서 다른 것을 요구하고 있었다. 이 규칙은 그 재발을 막기 위한 것이다.

#### 구체 판정 기준 — 단일 사용자 / 로컬 전용 전제 (A1 / A4 / A6)

finance-tracker의 기본 위협모델이므로 기준을 명문화한다.

**A1 — 접근통제**

| 하위 요소 | 위협모델 해당 | 판정 방법 |
|---|---|---|
| 타 사용자 데이터 접근(IDOR) | **미해당** — `users` 테이블도 소유자 컬럼도 없음(`src/db/init.js:15-125`) | 예외 적용 |
| CSRF(브라우저 경유 상태변경) | **해당** | 통과기준 그대로 적용 |
| 파괴적 동작의 확인 절차 | **해당** — 사용자 수와 무관 | 통과기준 그대로 적용 |

루프백 바인딩은 *다른 기기*의 접근을 막을 뿐, **같은 기기의 브라우저가 방문한 임의 사이트로부터의 요청은 막지 못한다.** 이 사실은 1차 감사 FND-01이 CSRF 실증으로 이미 증명했고, 그래서 `src/utils/csrfGuard.js`가 도입됐다.

→ **IDOR 하위 요소만 예외이고 나머지 둘은 그대로 판정한다. 항목 전체를 예외로 처리하지 않는다.**

**A4 — 인증·세션**

인증 부재는 `docs/ARCHITECTURE.md`에 문서화된 설계 결정이므로 예외 대상이다. 판정은 **전제의 강제 여부**로 갈린다(규칙 2).

- 비루프백 바인딩 시 기동을 거부하거나 명시적 opt-in 환경변수를 요구 → **Pass(예외)**
- 기본값만 루프백(`src/server.js:71`)이고 `HOST` 설정으로 변경 가능하며 경고 로그(`:74-76`)에 그침 → **Partial** ← **현재 상태**

후자는 환경변수 한 줄로 전체 금융 데이터가 무인증 상태로 네트워크에 노출된다. 그 순간 **A1의 IDOR 예외 근거(소유자 개념 부재)도 함께 의미를 잃는다** — 인증 없이 노출된 단일 사용자 데이터는 "모두의 데이터"가 되기 때문이다. A1과 A4의 예외는 연동되므로 예외 대장에 같은 재평가 트리거로 묶어 기록한다.

**A6 — 민감데이터 보호**

| 하위 요소 | 위협모델 해당 | 판정 방법 |
|---|---|---|
| HTTPS 강제 | 루프백 전용이면 **미해당** | A4와 동일하게 **바인딩 강제 여부**로 Pass(예외)/Partial을 가름 |
| `.env` 미커밋 | **항상 해당** | 예외 없음 |
| 로그 내 평문 크레덴셜 0건 | **항상 해당** | 예외 없음 (`src/utils/http.js:5-15` `maskSecrets()`) |
| SQLite 파일 암호화 | 규칙 7 적용 — Part 2 통과기준에 없으므로 판정 근거로 쓰지 않는다 | 필요하면 루브릭 개정 후 반영 |

> SQLite 파일 암호화를 통과기준에 넣을 때는 **키 보관 위치를 함께 규정**해야 한다. 이 앱의 위협모델에서 디스크 접근은 곧 OS 계정 탈취를 뜻하므로, `data/`와 같은 디스크에 키를 두면 기준만 충족하고 위협은 그대로 남는 전형적인 대리변수가 된다.

### 축 A — 보안 (Security)

| # | 체크 항목 | 표준 근거 | 통과 기준 |
|---|---|---|---|
| A1 | 접근통제: 타 사용자 데이터(거래내역) 접근 차단(IDOR) + CSRF 방어 + 파괴적 동작 확인 절차 | OWASP Top10:2025 A01, ASVS V4/V8, CWE-862/639/352 | ① 모든 리소스 엔드포인트가 소유자 검증을 거침 ② 상태를 변경하는 모든 요청이 출처 검증을 거침(HTTP 메서드가 아니라 **쓰기 발생 여부** 기준) ③ 비가역·대량 삭제 라우트 전체에 일관된 확인 절차 |
| A2 | 인젝션 방지: SQLite 쿼리 파라미터 바인딩 | OWASP Top10:2025 A05, CWE-89, ASVS V5 | Raw 문자열 결합 쿼리 0건 |
| A3 | XSS 방지: 출력 이스케이핑 | CWE-79, ASVS V3(Web Frontend) | `dangerouslySetInnerHTML` 미사용 또는 sanitize 적용 |
| A4 | 인증: 비밀번호 해싱·세션 관리 | ASVS V6/V9, OWASP A07 | bcrypt/argon2, HttpOnly+Secure+SameSite 쿠키 |
| A5 | 설정 보안: 보안헤더/CORS/디버그모드 | OWASP Top10:2025 A02, ASVS V14 | Helmet 적용, CORS 화이트리스트, 프로덕션 디버그 off |
| A6 | 민감데이터 보호: 전송/저장 암호화 | ISO 25010 보안성, ASVS V7 | HTTPS 강제, `.env` 미커밋, 로그 내 평문 크레덴셜 0건 (SQLite 파일 암호화는 판정 규칙 7 참조 — Part 1 체크 항목을 판정 근거로 쓰지 않는다) |
| A7 | 의존성 공급망 | OWASP Top10:2025 A03 | npm audit 상 Critical/High 취약점 0건 |

### 축 B — 코드품질 (Code Quality)

| # | 체크 항목 | 표준 근거 | 통과 기준 |
|---|---|---|---|
| B1 | 테스트 커버리지(신규 코드) | SonarQube Sonar way, ISO 25010 시험용이성 | ≥ 80% |
| B2 | 코드 중복률 | SonarQube Sonar way | ≤ 3% |
| B3 | 복잡도 | SonarQube(Cognitive ≤15), Poka-yoke 관점 | 함수당 Cyclomatic ≤ 10 |
| B4 | 리뷰 프로세스 준수 | Google eng-practices, MS Playbook | PR 크기 중간값 <400줄, 응답 1영업일 이내 |
| B5 | 계층 분리/유지보수성 | ISO 25010 유지보수성, Lean(품질 내재화) | 라우트-컨트롤러-모델 분리, 순환의존 0건 |
| B6 | 트랜잭션/에러처리 | ISO 25010 신뢰성 | DB 트랜잭션 적용, 에러 바운더리/미들웨어 존재 |
| B7 | 프로세스 문서/추적성 | ISO 12207, CMMI(RDM/CM) | 요구사항-커밋-테스트 추적 가능 |

### 축 C — 성능 (Performance)

| # | 체크 항목 | 표준 근거 | 통과 기준 |
|---|---|---|---|
| C1 | LCP (최대 콘텐츠풀 페인트) | Core Web Vitals | p75 < 2.5s |
| C2 | INP (상호작용 응답) | Core Web Vitals | p75 < 200ms |
| C3 | CLS (레이아웃 안정성) | Core Web Vitals | p75 < 0.1 |
| C4 | API 응답시간 (단순 CRUD) | Google SRE, ISO 25010 성능효율성 | p95 < 300ms |
| C5 | API 응답시간 (집계/리포트) | Google SRE 관행 | p95 < 800~1000ms |
| C6 | DB 쿼리 효율 | ISO 25010, N+1 점검 | N+1 패턴 0건, 주요 조회 인덱스 존재 |
| C7 | 프론트엔드 번들/렌더링 최적화 | Web Vitals, Lean(낭비제거) | 코드 스플리팅 적용, 불필요 리렌더링 없음 |

---

## Part 3. 메타 프로세스 — PDCA/Kaizen 기반 감사 사이클 지속개선

감사 자체를 1회성 이벤트가 아닌 순환 거버넌스로 설계한다. 근거: ISO 9001 조항 9.2(내부감사)·10.2(시정조치)·10.3(지속적 개선), Six Sigma DMAIC의 Improve-Control 단계, Deming/Shewhart PDCA 사이클.

| 단계 | 내용 | 표준 근거 |
|---|---|---|
| **Plan** | 감사 범위·Part 2 루브릭 버전 확정, 이전 사이클 미해결 이슈와 **예외 대장(판정 규칙 4)** 을 우선순위·재판정 대상에 반영 | ISO 9001 9.2(계획된 주기), Six Sigma Define |
| **Do** | Part 2 축A/B/C 체크리스트 실행, Pass/Partial/Fail 판정 및 근거 기록. 위협모델 예외를 적용한 항목은 **예외 3요소(판정 규칙 3)** 를 함께 기록 | Six Sigma Measure |
| **Check** | 금번 결과를 직전 감사 결과와 비교(결함 재발률, 개선율), 근본원인분석(RCA) 수행 | ISO 9001 10.2, Six Sigma Analyze |
| **Act** | 성공한 개선안은 코딩표준/CI 게이트로 표준화(Poka-yoke화)하여 개발팀에 공식 반영; 미해결 이슈는 다음 사이클 Plan의 입력으로 승계 | ISO 9001 10.3, Six Sigma Control, TPS Jidoka(자동 게이트화) |

**운영 규칙**:

1. 감사 주기는 릴리스 주기 또는 분기 단위로 고정하고 문서화한다(ISO 9001 9.2 요구사항).
2. 발견된 결함은 즉시수정(correction)과 근본원인 시정조치(corrective action)를 구분해 기록한다(조항 10.2) — 예: SQL 인젝션 1건 패치는 correction, "파라미터 바인딩 린트 규칙 도입"은 corrective action.
3. Act 단계에서 표준화된 항목은 SonarQube Quality Gate/CI 파이프라인에 자동 게이트로 편입해 TPS의 Jidoka(이상 시 자동 정지) 원칙을 적용한다 — 즉, 감사가 매번 사람이 재확인하지 않아도 되는 항목은 자동화로 이관한다.
4. 감사팀은 개발팀과 조직적으로 분리 상태를 유지하며(ISO 9001 9.2 독립성 원칙), 감사 보고서는 경영검토(management review)에 준하는 의사결정권자에게 보고한다.
5. Kaizen 관점에서 "완벽한 1회 감사"보다 "사이클마다 측정 가능한 개선"을 목표로 한다 — Part 2 루브릭의 **Pass 비율 / 실질 Pass 비율 / 예외 비율 세 지표를 나란히** 추적한다(판정 규칙 5). 분모는 항상 21로 고정한다. 실질 Pass 비율이 정체된 채 Pass 비율만 오르면 개선이 아니라 예외의 확대다.
6. 정량 지표를 Fail 판정이나 이슈 생성의 근거로 쓸 때는 **측정 도구와 방법을 명시하고, 최소한 최댓값 1건을 수작업으로 검산**한다. 근사 측정치가 검증 없이 문제 진술이 되면 시정 범위 자체가 잘못 잡힌다 — 1차 감사의 복잡도 수치("218개 중 37개, 최대 43")가 AST 기반 재측정으로 재현되지 않았고(`REMEDIATION_RCA_2026-07-R2.md` §5.5), 그 위에서 이슈 #148이 생성된 사례가 있다.
7. 사이클 간 지표를 비교할 때는 **동일한 도구·방법으로 재측정한 값만** 추세로 읽는다. 방법이 다르면 비교 불가로 표기한다 — 도구 교체로 인한 수치 변화를 개선으로 오독하지 않기 위해서다.

---

## 참고: 불확실성 표기

본 문서의 표준 버전 정보(OWASP Top10:2025, ASVS 5.0.0, CWE Top25 2025판, ISO/IEC/IEEE 12207:2026, CMMI V3.0)는 2026-07-25 기준 웹 검색으로 확인된 최신 공식 릴리스입니다(확신도 90%+, 공식 출처 직접 확인). SonarQube 임계값(커버리지 80%, 중복률 3% 등)은 기본 "Sonar way" 게이트 값이며 조직별 커스터마이징 가능성이 있으므로 실제 도입 시 현재 조직 설정 재확인 권장(확신도 중간). API SLA 수치(p95 300ms/800ms)는 업계 일반 관행을 참고한 권장값이며 finance-tracker의 실제 트래픽 특성에 맞춰 조정이 필요합니다(확신도 중간, 절대 기준 아님).

---

## 개정 이력

- **2026-07-26 (사이클 2)**: Part 2에 「판정 규칙 — 척도와 위협모델 예외 처리」 신설. `N/A`를 정식 판정 카테고리로 두지 않고 위협모델 예외를 Pass/Partial에 흡수하는 절차(규칙 1~7)로 명문화. Pass 비율 집계의 분모를 21로 고정하고 실질 Pass 비율·예외 비율을 견제 지표로 병기하도록 함. A1 통과기준을 IDOR + CSRF + 파괴적 동작 확인 절차로 확장(출처 검증 기준을 메서드가 아니라 쓰기 발생 여부로 명시). A6의 SQLite 파일 암호화 판정 근거를 Part 2 통과기준으로 일원화. Part 3에 운영규칙 6(정량 지표 검산)·7(사이클 간 동일 도구 비교) 추가.
  - **근거**: 2라운드에서 개발팀 자체평가(PR #187)와 독립 감사(PR #204)가 A1/A4/A6 세 항목 전부에서 판정이 갈렸고(`N/A` vs `Partial`, Part 1 vs Part 2 근거 충돌), 그로 인해 사이클 간 Pass 비율 추이가 산출 불가 상태가 됨. 상세는 [`REMEDIATION_RCA_2026-07-R2.md`](./REMEDIATION_RCA_2026-07-R2.md) §5.2·§5.3.
  - **1차 감사 §6.2 제안 반영 상태**: 제안 3번(A1에 CSRF 명시) ✅ 반영 / 제안 4번(A1·A4·A6 예외 기준 명문화) ✅ 반영 / 제안 1번(C1~C3 판정 근거 재정의) ✅ 이미 `PERFORMANCE_BASELINE.md`로 반영 / 제안 2번(B1 신규 코드 커버리지 측정 인프라) ⬜ 미반영 — 다음 사이클 승계.
  - 공통 프로세스 레포(`little-jotjotsaw-base`)의 일반화 버전에도 동일 개정이 반영됨(프로젝트명·이슈번호 제외).
