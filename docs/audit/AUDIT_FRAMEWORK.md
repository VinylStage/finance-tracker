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

판정 척도: **Pass**(기준 충족) / **Partial**(부분 충족, 개선권고) / **Fail**(미충족, 시정조치 필수) — ISO 9001 조항 10.2의 부적합(Nonconformity) 판정 구조를 따른다.

### 축 A — 보안 (Security)

| # | 체크 항목 | 표준 근거 | 통과 기준 |
|---|---|---|---|
| A1 | 접근통제: 타 사용자 데이터(거래내역) 접근 차단 (IDOR) | OWASP Top10:2025 A01, ASVS V4/V8, CWE-862/639 | 모든 리소스 엔드포인트가 소유자 검증 미들웨어를 거침 |
| A2 | 인젝션 방지: SQLite 쿼리 파라미터 바인딩 | OWASP Top10:2025 A05, CWE-89, ASVS V5 | Raw 문자열 결합 쿼리 0건 |
| A3 | XSS 방지: 출력 이스케이핑 | CWE-79, ASVS V3(Web Frontend) | `dangerouslySetInnerHTML` 미사용 또는 sanitize 적용 |
| A4 | 인증: 비밀번호 해싱·세션 관리 | ASVS V6/V9, OWASP A07 | bcrypt/argon2, HttpOnly+Secure+SameSite 쿠키 |
| A5 | 설정 보안: 보안헤더/CORS/디버그모드 | OWASP Top10:2025 A02, ASVS V14 | Helmet 적용, CORS 화이트리스트, 프로덕션 디버그 off |
| A6 | 민감데이터 보호: 전송/저장 암호화 | ISO 25010 보안성, ASVS V7 | HTTPS 강제, `.env` 미커밋, 로그 내 평문 크레덴셜 0건 |
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
| **Plan** | 감사 범위·Part 2 루브릭 버전 확정, 이전 사이클 미해결 이슈를 우선순위에 반영 | ISO 9001 9.2(계획된 주기), Six Sigma Define |
| **Do** | Part 2 축A/B/C 체크리스트 실행, Pass/Partial/Fail 판정 및 근거 기록 | Six Sigma Measure |
| **Check** | 금번 결과를 직전 감사 결과와 비교(결함 재발률, 개선율), 근본원인분석(RCA) 수행 | ISO 9001 10.2, Six Sigma Analyze |
| **Act** | 성공한 개선안은 코딩표준/CI 게이트로 표준화(Poka-yoke화)하여 개발팀에 공식 반영; 미해결 이슈는 다음 사이클 Plan의 입력으로 승계 | ISO 9001 10.3, Six Sigma Control, TPS Jidoka(자동 게이트화) |

**운영 규칙**:

1. 감사 주기는 릴리스 주기 또는 분기 단위로 고정하고 문서화한다(ISO 9001 9.2 요구사항).
2. 발견된 결함은 즉시수정(correction)과 근본원인 시정조치(corrective action)를 구분해 기록한다(조항 10.2) — 예: SQL 인젝션 1건 패치는 correction, "파라미터 바인딩 린트 규칙 도입"은 corrective action.
3. Act 단계에서 표준화된 항목은 SonarQube Quality Gate/CI 파이프라인에 자동 게이트로 편입해 TPS의 Jidoka(이상 시 자동 정지) 원칙을 적용한다 — 즉, 감사가 매번 사람이 재확인하지 않아도 되는 항목은 자동화로 이관한다.
4. 감사팀은 개발팀과 조직적으로 분리 상태를 유지하며(ISO 9001 9.2 독립성 원칙), 감사 보고서는 경영검토(management review)에 준하는 의사결정권자에게 보고한다.
5. Kaizen 관점에서 "완벽한 1회 감사"보다 "사이클마다 측정 가능한 개선"을 목표로 한다 — Part 2 루브릭의 Pass 비율 추이를 핵심 지표로 추적한다.

---

## 참고: 불확실성 표기

본 문서의 표준 버전 정보(OWASP Top10:2025, ASVS 5.0.0, CWE Top25 2025판, ISO/IEC/IEEE 12207:2026, CMMI V3.0)는 2026-07-25 기준 웹 검색으로 확인된 최신 공식 릴리스입니다(확신도 90%+, 공식 출처 직접 확인). SonarQube 임계값(커버리지 80%, 중복률 3% 등)은 기본 "Sonar way" 게이트 값이며 조직별 커스터마이징 가능성이 있으므로 실제 도입 시 현재 조직 설정 재확인 권장(확신도 중간). API SLA 수치(p95 300ms/800ms)는 업계 일반 관행을 참고한 권장값이며 finance-tracker의 실제 트래픽 특성에 맞춰 조정이 필요합니다(확신도 중간, 절대 기준 아님).
