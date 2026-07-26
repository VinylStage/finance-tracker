# 독립 코드 감사 — 2라운드 자체평가 (2026-07-26)

`little-jotjotsaw-base` [AUDIT_FRAMEWORK.md](https://github.com/VinylStage/little-jotjotsaw-base/blob/main/docs/process/AUDIT_FRAMEWORK.md) Part 2 통합 루브릭(A1~A7 보안·B1~B7 코드품질·C1~C7 성능)을 v0.7.0(M0~M5 리메디에이션 완료 후) 코드베이스에 다시 적용. PDCA 메타프로세스의 "Check: 직전 감사 결과와 비교"에 해당.

**1라운드(2026-07 사이클1) 결과**: 22개 발견사항(FND-01~22) + A7 보완 — 전량 대응 완료(M0~M5).

## 판정 결과

### 축 A — 보안

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| A1 | 접근통제(IDOR) | **N/A** | 다중 사용자 모델 자체가 없는 단일사용자 로컬 앱 — 이 항목이 원래 전제하는 위협모델(타 사용자 데이터 접근)이 성립하지 않음 |
| A2 | 인젝션 방지 | **Pass** | 전체 라우트 파라미터 바인딩 확인. `transactions.js`의 동적 `IN (...)` 절도 값이 아닌 `?` 개수만 보간해 값은 전부 bind됨 |
| A3 | XSS 방지 | **Pass** | `dangerouslySetInnerHTML` 사용 0건 |
| A4 | 인증 | **N/A** | 인증 시스템 자체 없음(단일 로컬 사용자) |
| A5 | 보안헤더/CORS/디버그모드 | **Pass** | FND-04로 보안헤더 적용됨. CORS 미들웨어는 없으나 프론트가 같은 Express 서버에서 정적 서빙되는 동일-origin 구조라 불필요 |
| A6 | 민감데이터 보호(전송/저장 암호화) | **Fail(신규)** | `data/finance.db`가 평문 SQLite 파일 — 암호화 계층 없음(`file` 명령으로 일반 SQLite 파일임을 직접 확인). HTTPS는 로컬 전용이라 N/A, `.env` 미커밋은 확인됨. **DB 저장시 암호화만 미충족** |
| A7 | 의존성 공급망 | **Pass** | `npm audit --audit-level=high` root/client 둘 다 0 vulnerabilities |

### 축 B — 코드품질

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| B1 | 테스트 커버리지 | **Pass**(근사) | 전체 81.38%(c8 실측, `src/routes` 80.27%) — "신규 코드" 기준이 아닌 전체 기준이라 완전히 동일 지표는 아니나 목표(80%) 근접·상회 |
| B2 | 코드 중복률 ≤3% | **미측정** | 1라운드 8.48%에서 여러 차례 중복 제거(#141/#148 등) 있었으나 정량 재측정 도구가 없음 — jscpd 등 신규 devDependency 설치 필요(사전 승인 대상) |
| B3 | 복잡도(프레임워크 기준 CC≤10) | **Fail(기지)** | 1라운드는 완화된 기준(CC≤25)으로 37건 중 2건만 처리. 프레임워크 원 기준(≤10)으로 재면 위반 건수는 훨씬 많을 것 — PDCA 1라운드 리뷰에서 이미 "임계값 자체 재고" 제안한 항목, 신규 이슈화하지 않음 |
| B4 | 리뷰 프로세스 독립성 | **Fail(구조적, 기지)** | PR 작성자와 GitHub 계정이 동일해 리뷰어 지정이 API 레벨에서 거부됨(`422 Review cannot be requested from pull request author`) — 이미 사용자 확인하에 수용된 제약, 재이슈화하지 않음 |
| B5 | 계층분리/순환의존 | **Pass** | `src/utils`·`src/db`·`src/services` 어디도 `src/routes`를 require하지 않음 — 단방향 의존 확인 |
| B6 | 트랜잭션/에러처리 | **Pass** | `savings.js` 만기처리 등에서 `db.transaction()` 사용, 전역 에러 미들웨어(FND-04/15) + React ErrorBoundary 존재 |
| B7 | 프로세스 문서/추적성 | **Pass** | FND-17로 핵심 문서 3종 코드 일치화 완료, 커밋 전량 이슈 번호 참조 |

### 축 C — 성능

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| C1~C3 | Core Web Vitals | **Pass**(대체 루브릭) | #153에서 채택한 Lighthouse 랩 측정 기준: 점수 97~99, LCP ~900ms, CLS 0.000 |
| C4 | API 응답시간(단순 CRUD) p95 | **Pass** | 실측(20회 샘플): `/api/categories` p95 1.4ms, `/api/transactions?limit=100` p95 1.4ms — 목표(300ms) 대비 압도적 여유 |
| C5 | API 응답시간(집계) p95 | **Pass** | 실측: `/api/transactions/summary/dashboard` p95 3.7ms, `/api/cashflow` p95 1.2ms — 목표(800~1000ms) 대비 압도적 여유 |
| C6 | DB 쿼리 효율(N+1/인덱스) | **Pass** | FND-07(N+1 제거)·FND-08(sargable 인덱스) 완료 |
| C7 | 프론트엔드 번들/렌더링 | **Pass**(부분 미확인) | FND-22로 코드 스플리팅 적용 확인. "불필요 리렌더링 없음"은 React 프로파일링 미실시 — 이번엔 근거 부족으로 판정 보류 |

## 종합

| 판정 | 건수 |
|---|---|
| Pass | 13 |
| Fail(신규) | 1 (A6 — DB 암호화) |
| Fail(기지, 재이슈화 안 함) | 2 (B3 임계값, B4 리뷰 독립성) |
| 미측정 | 1 (B2 — 도구 필요) |
| N/A | 2 (A1, A4 — 위협모델 자체 미해당) |
| 판정 보류 | 1 (C7 리렌더링) |

**1라운드 대비**: 21개 rubric 항목 중 13개가 명확한 Pass로 전환(원래 감사는 개별 결함 22건을 발견한 것이라 직접적 rubric 대 rubric 비교는 아니지만, 이번 라운드에서 rubric을 그대로 적용해도 새로 발견된 심각한 결함은 A6 1건뿐 — 개선 추세 확인).

## 신규 이슈화 대상

- **A6(DB 암호화)**: 사용자 확인 대기 중(아키텍처+의존성 변경, 실 데이터 마이그레이션 수반) — 승인 시 이슈 생성
- **B2(중복률 재측정)**: jscpd 등 신규 devDependency 설치 필요 — 승인 시 진행

둘 다 이슈화하지 않은 항목(B3/B4)은 PDCA 1라운드에서 이미 다룬 기지 사항이라 중복 이슈 생성 생략.
