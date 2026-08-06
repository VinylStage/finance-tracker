
## 재개 세션 (직전 프로세스 비정상 종료 후 이어받기)
- 시작: 2026-08-06 12:58 KST
- 워크트리: /Users/vinyl/vinylstudio/finance-tracker-m11-wt (branch devnow, origin/develop 동기)
- 범위: Savings.jsx / Revolving.jsx 커버리지, 이후 Settings.jsx (분할 원칙 적용)
- 종료: (진행중)

### 재개 세션 진행
- 13:02 세션시작 DB 백업 (finance_20260806_130226_session-start-resume-coverage.db.bak, integrity ok)
- 13:03~13:11 Savings.jsx 커버리지 → 실제 결함 발견(수정 폼 key 누락) → PR #478
  - 25.8/25/17.39/28.3 → 96.77/96.29/91.3/96.22
  - 돌연변이 18건(14+4) 전부 잡힘
- 13:12~13:19 Revolving.jsx 커버리지 → PR #479
  - 35.71/35/17.39/39.21 → 98.21/95/95.65/98.03
  - 돌연변이 15건 중 14건 잡힘, 1건 등가변이(문서화)
  - vitest.setup.js scrollIntoView 스텁 동반(unhandled error 제거)
- 다음: Settings.jsx (1322줄) — 섹션별 분리 파일 원칙 적용
- 13:20~13:29 Settings.jsx 절 단위 분할 착수 → PR #480
  - SettingsDangerZone.test.jsx(11) + SettingsAppBasics.test.jsx(13)
  - 31.21/28.9/24.52/34.69 → 37.78/34.12/30.18/41.44
  - 돌연변이 21건 중 20건 잡힘, 1건은 층위상 불가(문서화)
  - 남은 절 10개: Category / RecurringRule / PaymentMethod / History / Export
    / SettingsBackup / TransactionsBackup / CardImport / CsvImport / (카드 컴포넌트들)
- 13:29 재개 세션 중간 보고

### Settings.jsx 절 단위 분할 (14:20~14:52)
- PR #482 fix(settings) 재활성화 부분전송 — Category 28 + PaymentMethod 17
  - 실서버 확인: categories 400, payment-methods 500 → 고친 뒤 200
  - 돌연변이 26건 전부 잡힘
- PR #483 test(settings) 반복 거래 관리 34건 — 돌연변이 15건 중 14건
- PR #486 test(settings) 백업·복원 22건 — 돌연변이 15건 중 14건
- PR #487 test(settings) 임포트 23건 — 돌연변이 13건 중 12건
- 남은 절: HistorySection(Link 한 줄), ExportSection(window.location.href 이동이라
  jsdom 에서 관측 불가), TrustPanel(components/, 테스트 없음)
- 카드 관련 절 6개는 components/ 의 별도 파일이고 각자 테스트가 이미 있다

## 밤모드 (21:00~22:10)
- 21:0x~21:2x #496 문서 드리프트 CI → PR #504
  - scripts/check-docs.js 신설, ci.yml 배선. API.md 7절·DATA_MODEL 3표 채움
  - DATA_MODEL 의 duplicate_dismissals 는 이름·컬럼 셋 다 틀려 있었다 → 정정
  - 검사기 자체가 schema_migrations 를 놓쳐 앞선 실측(3건)과 안 맞아 발견
  - 돌연변이 5건 전부 잡힘. GUIDE.md 게이트는 #490 과 함께 켜기로 판단·기록
- 20:5x #442 이관 → PR #502 (docs/BACKLOG.md, README 링크 교체), #442 에 코멘트
  - 체크박스 실측 16건(보고 때 15건이라 한 것 정정)
- 21:0x #497 마일스톤 게이트 → PR #503 (milestone-guard.yml, CONTRIBUTING)
  - 가짜 API 위 분기 20건 확인. 기존 17개 일괄 닫힘은 의도적으로 제외
- 21:3x Settings 내보내기·이력·TrustPanel → PR #505 (19건, 돌연변이 10/10)
- 21:5x Installments 폼 → PR #506 (26건, 돌연변이 15건 중 14, 1건 등가)
  - 테스트 2건이 틀린 이유로 통과하던 것을 돌연변이가 잡아냄
- 22:0x Debts 이력 축 → PR #507 (22건, 돌연변이 15/15)
- CI 플레이키 1건 관측(#379 에 기록) — duplicateDismissRestore, 재실행 통과
- 종료: 2026-08-06 22:10 KST. PR 6건 전부 CI 통과, 머지 없음

## 밤모드 이어서 (22:10~23:40)
- 22:5x Transactions 쓰기 축 → PR #509 (23건, 돌연변이 15건 중 13)
  - 55.01 → 80.29. 단언이 전체 GET 수를 세다 재조회 돌연변이 3건을 놓쳤던 것 수정
- 23:1x Simulator·Comparison·Guide → PR #511 (33건, 돌연변이 19건 중 16)
  - 셋 다 전용 테스트 파일이 없던 화면. 67.56→97.29 / 72→92 / 61.9→85.71
- 23:3x Dashboard 반복확인·섹션접힘 → PR #512 (13건, 돌연변이 10/10)
  - 61.79 → 73.03. 남은 차트·집계부는 별도 축으로 다음에
- 밤모드 누적: PR 9건(#502·#503·#504·#505·#506·#507·#509·#511·#512), 전부 CI 통과
- 머지 없음. 소스 변경은 #502(README)·#503(워크플로)·#504(문서·스크립트)뿐이고
  테스트 PR 6건은 소스 로직 무변경
