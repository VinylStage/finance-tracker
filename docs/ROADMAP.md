# 로드맵

## 현재 구현된 기능 요약

이 프로젝트는 아래 라우트 및 페이지 기반으로 구현되었습니다:

### 백엔드 API (src/routes/)
- `/api/transactions` - 거래 내역 CRUD, 500건 클램프 없이 서버 필터(가맹점/메모/금액범위/결제수단/카테고리)로 검색
- `/api/transactions/years` - 거래가 존재하는 연도 목록
- `/api/transactions/period-comparison` - 기간 비교 분석 (일별, 주별, 월별, 연별)
- `/api/transactions/summary/dashboard` - 대시보드 집계
- `/api/transactions/summary/category-breakdown` - 카테고리별 지출 분석
- `/api/transactions/summary/by-month` - 연도별 월간 수입/지출/건수 집계
- `/api/transactions/suggest/category` - 가맹점 기반 자동 카테고리 추천
- `/api/transactions/suggest/merchants` - 자동완성용 최근 가맹점 목록
- `/api/categories` - 카테고리 CRUD
- `/api/payment-methods` - 결제수단 CRUD
- `/api/settings` - 설정값 CRUD
- `/api/savings` - 저축 상품 CRUD
- `/api/revolving` - 리볼빙 히스토리 CRUD
- `/api/cashflow` - 현금흐름 분석 API
- `/api/debts` - 부채 CRUD 및 이자 계산
- `/api/installments` - 할부 상품 CRUD
- `/api/recurring-rules` - 반복거래(완전 고정금액) 규칙 CRUD, 이번 달 확정/건너뛰기
- `/api/csv-import` - 신한카드 CSV 임포트
- `/api/card-import` - 카드사 엑셀(농협/롯데/삼성/하나/현대) 일괄 임포트
- `/api/export` - 거래 내역 CSV/JSON 내보내기, 설정 백업/복원
- `/api/data` - 전체 데이터 백업 내보내기/복원(구버전 호환 경로)
- `/api/exchange` - 환율 조회
- `/api/stocks` - 주식 시세 조회(KIS 실연동 미구현)
- `/api/guide` - 사용 가이드 콘텐츠 조회
- `/api/card-policies` - 카드사·기간별 무이자 할부 정책 (#266, #271)
- `/api/card-products` - 카드 상품. `payment_methods`(카드사) 아래에 붙는다 (#274, #306)
- `/api/card-benefits` - 카드별 할인·적립 조건 (#274)
- `/api/accounts` - 통장·계좌와 잔액 (#288)
- `/api/audit` - 변경 이력 조회와 1단계 실행취소 (#297, #300)
- `/api/data-integrity` - 어긋난 데이터 훑기(보여주기만 한다) 
- `/api/recurring-rules/catchup` - 기동 시 자동 생성 결과 (#279)

### 프론트엔드 페이지 (client/src/pages/)
- `Dashboard` - 대시보드
- `Transactions` - 거래 내역 목록 및 추가/편집
- `Comparison` - 기간 비교 분석 (일별, 주별, 월별, 연별)
- `Revolving` - 리볼빙 페이지
- `Savings` - 저축 상품 목록
- `Debts` - 부채 관리
- `Installments` - 할부 상품 관리
- `Settings` - 애플리케이션 설정 및 카테고리/결제수단 관리
- `Simulator` - 재무 시뮬레이터
- `Guide` - 사용 가이드
- `AuditLog` - 변경 이력과 되돌리기 (`/settings/history`, #301)

## 계획 중인 기능

### 기능 확장
- [ ] 비동기 데이터 백업/복구 (ex. SQLite dump)
- [ ] 다국어 지원 (i18n)
- [ ] 예산 관리 및 예산 초과 알림
- [ ] 고급 보고서 및 시각화 (PDF, 차트 다운로드)
- [ ] 모바일 최적화 및 PWA 지원

### 성능 향상
- [ ] 거래 내역 페이징 로딩 개선
- [ ] 자동 완성 속도 개선
- [ ] 데이터베이스 인덱스 및 쿼리 최적화

## 알려진 기술 부채

- [ ] 라우트 경로 정리 및 중복 코드 제거
- [ ] 프론트엔드 컴포넌트의 재사용성 개선 (예: TransactionForm 공통화)
- [ ] 백엔드 API의 데이터 검증 로직 보완
- [ ] 프론트엔드에 대한 E2E 테스트 추가 필요
- [ ] SQLite DB의 스키마 변경 로그 관리 방식 정리
- [ ] 입력 테두리(`--color-line-strong`)가 WCAG 1.4.11 비텍스트 대비 3:1 미달 (흰 배경 1.60). 통과시키려면 리뉴얼이 의도한 헤어라인 인상이 무너져 알려진 예외로 남겼다. 교체 전 값보다는 개선된 상태다 (#247)

## 미결 이슈

- [ ] 다운로드된 차트 이미지의 품질 문제 (Recharts 렌더링)
- [ ] 사용자 로그인 및 계정 시스템 필요
- [ ] 실시간 차트 업데이트 방식 개선
## 마일스톤 진행 (2026-08-04 기준)

| | 내용 | 상태 |
|---|---|---|
| M6 | 파생 거래 — 할부·리볼빙·부채이자를 거래로 드러낸다 (#268~#271) | 완료 |
| M7 | 반복 거래 — 주기·기간과 기동 시 따라잡기 (#278~#280) | #280 PR 대기 |
| M8 | 카드 전략 — 카드 상품·혜택 (#274, #302) | #274 PR 대기, #302 대기 |
| M9 | 데이터 정합성 — 감사 로그와 실행취소 (#296~#301) | #301 PR 대기 |
| M10 | 부채 — 대출 유형별 이자와 상환 스케줄 (#284~#287) | 완료 |
| M11 | 잔액 추적 — 결제 시점 분리와 통장 잔액 (#288~#291) | #288 완료, 나머지 대기 |

### M11 이 막혀 있는 지점

- **#289 (결제 3분류)** — `deferred` ↔ `settlement` 연결 방식(A/B) 미확정.
  `transactions` 에 컬럼 3개를 더하고 거래 한 행의 의미를 바꾸는 변경이라 승인이 필요하다
- **#290 (카드 청구 주기)** — `billingMonthFor()` 는 #274 의 `statement_close_day` 를
  쓴다. #274 가 머지되면 풀린다
- **#291 (잔액 표시)** — 위 둘에 의존한다

### 되돌아보며 정한 것

- **마이그레이션 번호는 모든 원격 브랜치에서 확인하고 딴다.** develop 만 보면
  동시 진행 중인 브랜치와 충돌한다. 이번 사이클에서 3번 겪었다
- **브랜치는 항상 `origin/develop` 에서 딴다.** 이 저장소는 스쿼시 머지라 선행 이슈
  브랜치를 베이스로 삼으면 원본 커밋이 남아 중복 충돌이 난다 (PR #294)
- **새 표를 더하는 마이그레이션은 `rebuildAuditTriggers(db)` 를 부른다.**
  017 이 만들 때 있던 표만 대상이라 저절로 안 붙는다 (018, 019 에서 실제로 걸림)
