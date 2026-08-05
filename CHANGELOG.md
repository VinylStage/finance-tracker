# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0](https://github.com/VinylStage/finance-tracker/compare/v0.8.0...v0.9.0) (2026-07-29)


### Features

* **ui:** Pretendard 한글·라틴 고빈도 서브셋 self-host ([#244](https://github.com/VinylStage/finance-tracker/issues/244)) ([#252](https://github.com/VinylStage/finance-tracker/issues/252)) ([0fc9d32](https://github.com/VinylStage/finance-tracker/commit/0fc9d32540f362bba97311775cf55f8d0a5f9090))
* **ui:** 모바일 하단 탭바를 인라인 SVG 아이콘으로 재구성 ([#246](https://github.com/VinylStage/finance-tracker/issues/246)) ([#262](https://github.com/VinylStage/finance-tracker/issues/262)) ([c5424bb](https://github.com/VinylStage/finance-tracker/commit/c5424bb35ee042009790a773dcab6a291598ce2b))
* **ui:** 설정 페이지 좌측 앵커 목차 ([#245](https://github.com/VinylStage/finance-tracker/issues/245)) ([#260](https://github.com/VinylStage/finance-tracker/issues/260)) ([d7fdffb](https://github.com/VinylStage/finance-tracker/commit/d7fdffb69af545edab44777508b9a353ed6e9805))
* **ui:** 시각 디자인 토큰 체계 전면 교체 ([#240](https://github.com/VinylStage/finance-tracker/issues/240)) ([#248](https://github.com/VinylStage/finance-tracker/issues/248)) ([892bc7e](https://github.com/VinylStage/finance-tracker/commit/892bc7e7453b19a9913ff46720fd834d2dd1843e))
* **ui:** 인라인 SVG 아이콘 기반 도입 ([#244](https://github.com/VinylStage/finance-tracker/issues/244)) ([#251](https://github.com/VinylStage/finance-tracker/issues/251)) ([fa18bed](https://github.com/VinylStage/finance-tracker/commit/fa18bed9fd08a715c30142c20f5f85c37425ba85))
* **ui:** 일별 지출 강도 캘린더 히트맵 ([#242](https://github.com/VinylStage/finance-tracker/issues/242)) ([#259](https://github.com/VinylStage/finance-tracker/issues/259)) ([6ae544d](https://github.com/VinylStage/finance-tracker/commit/6ae544d7a19074121d181e82357a1ece0a7f9986))
* **ui:** 자금 흐름 100% 스택 바와 목록 ([#241](https://github.com/VinylStage/finance-tracker/issues/241)) ([#261](https://github.com/VinylStage/finance-tracker/issues/261)) ([a8542a5](https://github.com/VinylStage/finance-tracker/commit/a8542a5b23c0258aa4859b5a0a158da76c7d0978))
* **ui:** 카테고리 아이콘 배선과 남은 이모지 제거 ([#244](https://github.com/VinylStage/finance-tracker/issues/244), [#254](https://github.com/VinylStage/finance-tracker/issues/254)) ([#256](https://github.com/VinylStage/finance-tracker/issues/256)) ([410556c](https://github.com/VinylStage/finance-tracker/commit/410556c4465743949f36a5d6bdaa7be77e15273d))


### Bug Fixes

* 스택 PR 이 잘못된 base 로 머지돼 누락된 모듈 복구 ([#241](https://github.com/VinylStage/finance-tracker/issues/241), [#242](https://github.com/VinylStage/finance-tracker/issues/242)) ([#253](https://github.com/VinylStage/finance-tracker/issues/253)) ([af53eb1](https://github.com/VinylStage/finance-tracker/commit/af53eb1dfc067622a34a34eea286d9ec7389b04e))


### Maintenance

* **release:** develop → main 릴리즈 (시각 디자인 리뉴얼 사이클) ([037e1b5](https://github.com/VinylStage/finance-tracker/commit/037e1b539a81c8bf42b018da330f782c3fbed33b))


### Documentation

* **audit:** 미시정 결함 재현 상세를 비공개 저장소로 분리 ([#205](https://github.com/VinylStage/finance-tracker/issues/205)) ([#255](https://github.com/VinylStage/finance-tracker/issues/255)) ([208c711](https://github.com/VinylStage/finance-tracker/commit/208c7113cca63ac44aaad04b057664064c714691))
* **audit:** 설계 절충 예외 대장을 신설하고 line-strong 미달을 등재 ([#247](https://github.com/VinylStage/finance-tracker/issues/247)) ([#263](https://github.com/VinylStage/finance-tracker/issues/263)) ([8969a61](https://github.com/VinylStage/finance-tracker/commit/8969a61c6108765112a759842d3e2dfad3955396))

## [0.8.0](https://github.com/VinylStage/finance-tracker/compare/v0.7.0...v0.8.0) (2026-07-28)


### Features

* **ui:** IA 5그룹 재구성 + wouter URL 라우팅 도입 ([#215](https://github.com/VinylStage/finance-tracker/issues/215)) ([8a43bf3](https://github.com/VinylStage/finance-tracker/commit/8a43bf33ace4ec11365b0ad9a031204cf089caa8))
* **ui:** 거래 빠른입력 UX 개선 — 모달 전환·최근 가맹점 원탭·잔여예산 인라인 ([#224](https://github.com/VinylStage/finance-tracker/issues/224)) ([f175cc4](https://github.com/VinylStage/finance-tracker/commit/f175cc486e1fb829e68923d0c23d64ab457096ee)), closes [#196](https://github.com/VinylStage/finance-tracker/issues/196)
* **ui:** 거래 테이블 모바일 카드뷰 전환 — 컬럼 숨김 제거 ([#216](https://github.com/VinylStage/finance-tracker/issues/216)) ([1db9a6a](https://github.com/VinylStage/finance-tracker/commit/1db9a6ac06764cf680ae7802999abcac7d708856))
* **ui:** 다크모드 도입 ([#201](https://github.com/VinylStage/finance-tracker/issues/201)) ([#227](https://github.com/VinylStage/finance-tracker/issues/227)) ([a2fdae3](https://github.com/VinylStage/finance-tracker/commit/a2fdae3504f82d6431dad5c9a2cd499679a26613))
* **ui:** 대시보드 하위 섹션 기본 접힘 처리 ([#219](https://github.com/VinylStage/finance-tracker/issues/219)) ([eb11fdb](https://github.com/VinylStage/finance-tracker/commit/eb11fdb3b5a2c6020943f2bb7bbe1732250dea4c))
* **ui:** 시맨틱 디자인 토큰 시스템 도입 ([#213](https://github.com/VinylStage/finance-tracker/issues/213)) ([c77cd49](https://github.com/VinylStage/finance-tracker/commit/c77cd49b2c63b7546bd9d277c7a6b3ff1c94cdb0))
* **ui:** 신뢰 마이크로카피 + 마지막 내보내기 시각 표시 ([#222](https://github.com/VinylStage/finance-tracker/issues/222)) ([c18c158](https://github.com/VinylStage/finance-tracker/commit/c18c158020cd64faf122ae1ec90b2039d1b531af))
* **ui:** 예산 진행바 손실회피 프레이밍 3단계 전환 ([#217](https://github.com/VinylStage/finance-tracker/issues/217)) ([e90f601](https://github.com/VinylStage/finance-tracker/commit/e90f601ae3c131a908c8f99d31004346b6b6ff76))
* **ui:** 저축 목표 진행바 goal-gradient 도입 ([#220](https://github.com/VinylStage/finance-tracker/issues/220)) ([726fb0c](https://github.com/VinylStage/finance-tracker/commit/726fb0c8bb92254dda1b4570d084a2c4c13ad915)), closes [#200](https://github.com/VinylStage/finance-tracker/issues/200)
* **ui:** 최초 실행 온보딩 + 공통 EmptyState 도입 ([#223](https://github.com/VinylStage/finance-tracker/issues/223)) ([5b4c7bf](https://github.com/VinylStage/finance-tracker/commit/5b4c7bf6e894d0ffe76ba4039bc3c695f919fe06)), closes [#197](https://github.com/VinylStage/finance-tracker/issues/197)
* **ui:** 카테고리별 지출 랭킹 막대 기본 뷰 + 파이 Top5 캡핑 ([#218](https://github.com/VinylStage/finance-tracker/issues/218)) ([604e5aa](https://github.com/VinylStage/finance-tracker/commit/604e5aa99b4166bbe1796cf4faa5d0fe35450d4e))


### Bug Fixes

* **a11y:** 카테고리 대분류를 색상+아이콘+텍스트 3중 인코딩으로 전환 ([#214](https://github.com/VinylStage/finance-tracker/issues/214)) ([a1b7c0d](https://github.com/VinylStage/finance-tracker/commit/a1b7c0d840d4403c44e6f9e48ba6fc41c7b740f3))
* **ui:** CSP 가 막던 다크모드 부트스트랩을 외부 스크립트로 분리 ([#228](https://github.com/VinylStage/finance-tracker/issues/228)) ([#229](https://github.com/VinylStage/finance-tracker/issues/229)) ([67bd82e](https://github.com/VinylStage/finance-tracker/commit/67bd82e82661766b812bf670556b58cfd924da2f))
* 사용자에게 노출되던 개발자용 에러 메시지 정리 ([#231](https://github.com/VinylStage/finance-tracker/issues/231)) ([#232](https://github.com/VinylStage/finance-tracker/issues/232)) ([3b59c3f](https://github.com/VinylStage/finance-tracker/commit/3b59c3fe831e35412f71490819791ea9d6175a1e))
* 숫자 필드 검증을 선언적 미들웨어로 전환 ([#211](https://github.com/VinylStage/finance-tracker/issues/211)) ([#233](https://github.com/VinylStage/finance-tracker/issues/233)) ([3bf38f0](https://github.com/VinylStage/finance-tracker/commit/3bf38f09beb0cb87d618b8be2dc5bd6532cbee57))


### Maintenance

* **process:** 문서 변경 승인 게이트(confirm-chain) 배선 ([#209](https://github.com/VinylStage/finance-tracker/issues/209)) ([8d25a21](https://github.com/VinylStage/finance-tracker/commit/8d25a21503bb74b5c49932c148d82ef41337b24f))


### Documentation

* **audit:** 2라운드 PDCA 교차검토 — A1 판정 정정 + 신규결함 3건 근본원인 ([#207](https://github.com/VinylStage/finance-tracker/issues/207)) ([74eef24](https://github.com/VinylStage/finance-tracker/commit/74eef243679612beb6999801604f2969cacaa370))
* **audit:** 2차 독립 감사 보고서 — 루브릭 21항목 실측 재판정 (R2) ([#204](https://github.com/VinylStage/finance-tracker/issues/204)) ([33bda4d](https://github.com/VinylStage/finance-tracker/commit/33bda4dc9ec0dc9f040a1dcf4d495951e684cf05))
* **audit:** 루브릭에 위협모델 예외 판정 절차 명문화 — N/A 대신 Pass/Partial 흡수 ([#208](https://github.com/VinylStage/finance-tracker/issues/208)) ([3f67ddd](https://github.com/VinylStage/finance-tracker/commit/3f67dddc2ba786f717255a5a728288dc6b7ae7f1))
* UI/UX 개편 설계 문서 추가 ([#203](https://github.com/VinylStage/finance-tracker/issues/203)) ([3374ad4](https://github.com/VinylStage/finance-tracker/commit/3374ad461b0c3097102c013ed47b75646319fd2b))
* 개발팀 자체평가(2라운드) — 독립 감사와 병행 ([#187](https://github.com/VinylStage/finance-tracker/issues/187)) ([5ebd030](https://github.com/VinylStage/finance-tracker/commit/5ebd030058a78ae3b7ac79a63c5a3c8d5856aa3d))
* 마이크로카피/보이스톤 가이드 신설 ([#221](https://github.com/VinylStage/finance-tracker/issues/221)) ([633d83b](https://github.com/VinylStage/finance-tracker/commit/633d83bf4b180ea363e728d7a7e4769293a1cd54)), closes [#202](https://github.com/VinylStage/finance-tracker/issues/202)
* 인증·세션 전략 ADR 신설 ([#189](https://github.com/VinylStage/finance-tracker/issues/189)) ([#230](https://github.com/VinylStage/finance-tracker/issues/230)) ([c334263](https://github.com/VinylStage/finance-tracker/commit/c3342634f10b6636ded21edd7abd3138c4e482a0))

## [0.7.0](https://github.com/VinylStage/finance-tracker/compare/v0.6.0...v0.7.0) (2026-07-26)


### Features

* **#153:** Lighthouse 3회 측정 스크립트 도입, 성능 기준선 기록(C1~C3) ([#182](https://github.com/VinylStage/finance-tracker/issues/182)) ([275674a](https://github.com/VinylStage/finance-tracker/commit/275674aa79778700d616828f54f036ecba2c418b))
* M5 잔여 이슈 3건 — 라우트 테스트/할부 자동완료/데이터 무결성/커버리지 계측 ([#183](https://github.com/VinylStage/finance-tracker/issues/183)) ([4f5cf46](https://github.com/VinylStage/finance-tracker/commit/4f5cf46594791b418b90a620b92489e56ab2963c))


### Bug Fixes

* **#139:** 거래내역 500건 클램프 근본해결 — 검색·집계 서버 파라미터화 (A안) ([#171](https://github.com/VinylStage/finance-tracker/issues/171)) ([9ca9efe](https://github.com/VinylStage/finance-tracker/commit/9ca9efe78ba6c63c2c5430e361ea526f700cc7f9))
* **#140:** 설정 복원을 DELETE+INSERT에서 UPSERT로 전환, 확인 토큰 추가 ([#167](https://github.com/VinylStage/finance-tracker/issues/167)) ([6fb7b37](https://github.com/VinylStage/finance-tracker/commit/6fb7b3752b18bfb043abeb45621cc70719e09b56))
* **#141:** 할부 청구액 계산을 대시보드와 통일, 집계 규칙/날짜 헬퍼 중복 제거 ([#168](https://github.com/VinylStage/finance-tracker/issues/168)) ([5174ffb](https://github.com/VinylStage/finance-tracker/commit/5174ffb9a0a1acf6f4baed547ff97f3e21b31495))
* **#142:** 리볼빙/부채/백업임포트 금액 필드에 asInt 검증 적용 ([#169](https://github.com/VinylStage/finance-tracker/issues/169)) ([0cc89f8](https://github.com/VinylStage/finance-tracker/commit/0cc89f8a4987e900e808b6f355d61c94d08fe0f5))
* **#143:** 할부 경과월 계산의 UTC 'now' 의존 제거(KST 자정~9시 오차) ([#170](https://github.com/VinylStage/finance-tracker/issues/170)) ([6874c1c](https://github.com/VinylStage/finance-tracker/commit/6874c1cceee594ca96c26a17e437102a1f953442))
* **#144:** cashflow.js의 N+1 쿼리 제거, transactions.js와 rangeTotalsByDate 공유 ([#172](https://github.com/VinylStage/finance-tracker/issues/172)) ([64a35b1](https://github.com/VinylStage/finance-tracker/commit/64a35b1825bf2367f706364a2bfd06b72362853c))
* **#145:** 비sargable WHERE를 범위 비교로 재작성, installments 인덱스 추가 ([#173](https://github.com/VinylStage/finance-tracker/issues/173)) ([36728f8](https://github.com/VinylStage/finance-tracker/commit/36728f84f8d8ffcacf8a890463346205dd04e3d0))
* **#146:** /api/* 전용 404 핸들러 추가 ([#174](https://github.com/VinylStage/finance-tracker/issues/174)) ([4250bd4](https://github.com/VinylStage/finance-tracker/commit/4250bd46339cf5a4f56ae883e81fd5ef8e371b3c))
* **#147:** GET /api/settings가 내부 에러 메시지를 노출하던 문제 수정 ([#175](https://github.com/VinylStage/finance-tracker/issues/175)) ([628983b](https://github.com/VinylStage/finance-tracker/commit/628983b72c91b238e6ffc9c5b4f5a67895003848))
* **#150:** stocks.js가 모든 에러를 "미활성화"로 삼키고 로깅 안 하던 문제 수정 ([#176](https://github.com/VinylStage/finance-tracker/issues/176)) ([fdd96a1](https://github.com/VinylStage/finance-tracker/commit/fdd96a15c82329864303a20a959c06596fe29033))
* **#151:** 폼 입력요소 79개 전체에 접근성 라벨 부여(FND-21) ([#180](https://github.com/VinylStage/finance-tracker/issues/180)) ([996c84c](https://github.com/VinylStage/finance-tracker/commit/996c84c5a9946a7e681cce53b9e6cbeef271dde4))
* **ci:** 문법검사 게이트가 실패를 감지하지 못하는 문제 수정 ([#133](https://github.com/VinylStage/finance-tracker/issues/133)) ([#155](https://github.com/VinylStage/finance-tracker/issues/155)) ([c644282](https://github.com/VinylStage/finance-tracker/commit/c644282a008d3a118ef3fce39b714fd5ee3c18b5))
* **security:** CSRF 방어 미들웨어 도입 ([#134](https://github.com/VinylStage/finance-tracker/issues/134)) ([#158](https://github.com/VinylStage/finance-tracker/issues/158)) ([2c660f1](https://github.com/VinylStage/finance-tracker/commit/2c660f1743ce87f3d8661a40cd1043437ec2584f))
* **security:** export 라우트 Content-Disposition 헤더 인젝션 방지 ([#137](https://github.com/VinylStage/finance-tracker/issues/137)) ([#161](https://github.com/VinylStage/finance-tracker/issues/161)) ([aa0200f](https://github.com/VinylStage/finance-tracker/commit/aa0200f89451f1b72089be935dd9ff24b3674f53))
* **security:** 보안 헤더 추가 + 전역 에러 미들웨어 + React ErrorBoundary ([#135](https://github.com/VinylStage/finance-tracker/issues/135)) ([#159](https://github.com/VinylStage/finance-tracker/issues/159)) ([a873ddd](https://github.com/VinylStage/finance-tracker/commit/a873dddd2ac72934f490e71bb49abbe45c5620b6))
* **security:** 카드 임포트 업로드 파일 크기/형식 제한 ([#136](https://github.com/VinylStage/finance-tracker/issues/136)) ([#160](https://github.com/VinylStage/finance-tracker/issues/160)) ([0acf6f6](https://github.com/VinylStage/finance-tracker/commit/0acf6f6da383d427e58a7e5c497e3c12000434da))


### Maintenance

* **deps-dev:** bump @vitejs/plugin-react in /client ([#166](https://github.com/VinylStage/finance-tracker/issues/166)) ([8e59306](https://github.com/VinylStage/finance-tracker/commit/8e59306be221dd4540da12d28d3b1062a2f2cbf7))
* **deps:** bump react-dom from 19.2.7 to 19.2.8 in /client ([#163](https://github.com/VinylStage/finance-tracker/issues/163)) ([17cf158](https://github.com/VinylStage/finance-tracker/commit/17cf158c5ccdd6dca22f6bdbd6559045d1e5a9d7))
* **deps:** bump recharts from 3.10.0 to 3.10.1 in /client ([#165](https://github.com/VinylStage/finance-tracker/issues/165)) ([0e57fde](https://github.com/VinylStage/finance-tracker/commit/0e57fde99b2bd7b8d657dd098894e0eb3c97fdeb))
* **security:** 공급망 게이트 추가 — dependabot.yml + CI npm audit ([#138](https://github.com/VinylStage/finance-tracker/issues/138)) ([#162](https://github.com/VinylStage/finance-tracker/issues/162)) ([647f858](https://github.com/VinylStage/finance-tracker/commit/647f85819ebef138d079b7e668686b41de4a903e))


### Documentation

* **#149:** 핵심 문서 3종의 라우트/페이지 목록을 코드 기준으로 갱신 ([#179](https://github.com/VinylStage/finance-tracker/issues/179)) ([fb2860b](https://github.com/VinylStage/finance-tracker/commit/fb2860b023ffa34c53aa973eb976ad267f3092a4))
* **audit:** 2026-07 사이클1 독립 코드 감사 보고서 추가 ([4c40ccf](https://github.com/VinylStage/finance-tracker/commit/4c40ccf78f27bca891e4f83b80061273b34abdae))
* **audit:** PDCA 1라운드 교차검토 — 감사팀↔개발팀 양방향 재검토 ([#184](https://github.com/VinylStage/finance-tracker/issues/184)) ([78cf793](https://github.com/VinylStage/finance-tracker/commit/78cf793e57236f64df1034ab44a7532062386cb2))

## [0.6.0](https://github.com/VinylStage/finance-tracker/compare/v0.5.0...v0.6.0) (2026-07-25)


### Features

* 거래내역 검색·필터 고도화 — 가맹점/금액범위/결제수단/메모/다중카테고리 ([#126](https://github.com/VinylStage/finance-tracker/issues/126)) ([#127](https://github.com/VinylStage/finance-tracker/issues/127)) ([029c737](https://github.com/VinylStage/finance-tracker/commit/029c737d7ff1405fe4b1876dda85142a78e5aa9d))
* 완전 고정금액 반복 거래 자동등록 ([#128](https://github.com/VinylStage/finance-tracker/issues/128)) ([#129](https://github.com/VinylStage/finance-tracker/issues/129)) ([fe342ba](https://github.com/VinylStage/finance-tracker/commit/fe342ba668321e789b398bad59f1d438e90d7eb9))
* 카드 임포트 경로를 카드사별 단일 경로로 통합 ([#120](https://github.com/VinylStage/finance-tracker/issues/120)) ([4f4d98c](https://github.com/VinylStage/finance-tracker/commit/4f4d98c61cec4741aa88ec129e8a020580c24c3f))


### Bug Fixes

* **deps:** xlsx high 취약점 2건 해소 — 벤더링 CDN 패치본 교체 ([#112](https://github.com/VinylStage/finance-tracker/issues/112)) ([28b6aa7](https://github.com/VinylStage/finance-tracker/commit/28b6aa7f70d96d2e6f4a660e25effb93f8d8cc97))
* payment_style/major_type 허용값을 애플리케이션 레벨에서 검증 ([#90](https://github.com/VinylStage/finance-tracker/issues/90)) ([#119](https://github.com/VinylStage/finance-tracker/issues/119)) ([b66c7f2](https://github.com/VinylStage/finance-tracker/commit/b66c7f28a1955ed8a48ebc6fe605f28b8cc479c4))
* toISOString() 로컬 날짜 생성 버그 수정 ([#75](https://github.com/VinylStage/finance-tracker/issues/75)) ([#114](https://github.com/VinylStage/finance-tracker/issues/114)) ([bb0bccb](https://github.com/VinylStage/finance-tracker/commit/bb0bccb877eaed38102c869cd8a320a753c3b5f0))
* 입력 검증 구멍 2건 수정 ([#104](https://github.com/VinylStage/finance-tracker/issues/104)) ([#116](https://github.com/VinylStage/finance-tracker/issues/116)) ([2fdb069](https://github.com/VinylStage/finance-tracker/commit/2fdb0692aca66c0cf21c58081791d77be244daf0))


### Maintenance

* DB 마이그레이션 버전 관리 도입 ([#89](https://github.com/VinylStage/finance-tracker/issues/89)) ([#118](https://github.com/VinylStage/finance-tracker/issues/118)) ([9697bae](https://github.com/VinylStage/finance-tracker/commit/9697bae60d7f6724c5b1f8a040b09a930234cef7))
* 방어적 견고성 개선 2건 — headersSent 가드, e.message 안전 접근 ([#105](https://github.com/VinylStage/finance-tracker/issues/105)) ([#123](https://github.com/VinylStage/finance-tracker/issues/123)) ([a41808d](https://github.com/VinylStage/finance-tracker/commit/a41808d5bf93fb2758426ab2fade3cd22fb57fa8))


### Documentation

* **audit:** 독립 코드 감사 프레임워크 추가 ([#115](https://github.com/VinylStage/finance-tracker/issues/115)) ([ff2b1fb](https://github.com/VinylStage/finance-tracker/commit/ff2b1fb817890d86428915d662a6cff62a6a4c20))

## [0.5.0](https://github.com/VinylStage/finance-tracker/compare/v0.4.0...v0.5.0) (2026-07-25)


### Features

* **card-import:** 카드사 엑셀 여러 파일 한 번에 임포트 ([#102](https://github.com/VinylStage/finance-tracker/issues/102)) ([#106](https://github.com/VinylStage/finance-tracker/issues/106)) ([517ea7e](https://github.com/VinylStage/finance-tracker/commit/517ea7efa82084c1fa9757d820dec9c250e974f4))


### Bug Fixes

* **backup:** export/import 왕복에서 결제방식·결제수단·승인번호 보존 ([#77](https://github.com/VinylStage/finance-tracker/issues/77)) ([#94](https://github.com/VinylStage/finance-tracker/issues/94)) ([6de0937](https://github.com/VinylStage/finance-tracker/commit/6de09374e06f99c6b480e5e6bbd92e967f782c09))
* **card-import:** 업로드 엑셀 파서 크래시 방어 + 파서 오류 400 응답 ([#79](https://github.com/VinylStage/finance-tracker/issues/79)) ([#96](https://github.com/VinylStage/finance-tracker/issues/96)) ([6a8a0a5](https://github.com/VinylStage/finance-tracker/commit/6a8a0a5823a1cfb90ac35a27b870687306d564cd))
* **ci:** release-please if 조건 제거 — 릴리즈 태그 발행 차단 해소 ([#68](https://github.com/VinylStage/finance-tracker/issues/68)) ([79afead](https://github.com/VinylStage/finance-tracker/commit/79afead2fcf1ede1385b82ffc0f5cb0dd9c3ee1b))
* **csv:** 카드사 CSV 파싱 정확성 3건 — 금액 절단, 날짜 미정규화, CRLF ([#78](https://github.com/VinylStage/finance-tracker/issues/78)) ([#95](https://github.com/VinylStage/finance-tracker/issues/95)) ([f170d94](https://github.com/VinylStage/finance-tracker/commit/f170d9430b041c663fd686821c3247a3aa3c63d1))
* **dashboard:** 종료된 할부가 가용현금에서 계속 차감되던 문제 수정 ([#76](https://github.com/VinylStage/finance-tracker/issues/76)) ([#93](https://github.com/VinylStage/finance-tracker/issues/93)) ([12ef014](https://github.com/VinylStage/finance-tracker/commit/12ef014742c1a3b18a31c28c02fd9b5fefa56b20))
* **data:** import 본문 제한 정상화 + overwrite 확인 토큰 요구 ([#80](https://github.com/VinylStage/finance-tracker/issues/80)) ([#97](https://github.com/VinylStage/finance-tracker/issues/97)) ([f43f1d4](https://github.com/VinylStage/finance-tracker/commit/f43f1d491d924fc375660e7ee8b3549bcf74ce46))
* **server:** HOST 환경변수로 바인딩 제어, 기본값을 루프백으로 ([#72](https://github.com/VinylStage/finance-tracker/issues/72)) ([#73](https://github.com/VinylStage/finance-tracker/issues/73)) ([9a61f98](https://github.com/VinylStage/finance-tracker/commit/9a61f98e432e2f7c5d0727c6e46839ba7621b1fc))
* **services:** 외부 API 호출 타임아웃 + 시크릿 마스킹 + KIS 환경변수 ([#83](https://github.com/VinylStage/finance-tracker/issues/83)) ([#100](https://github.com/VinylStage/finance-tracker/issues/100)) ([750cc80](https://github.com/VinylStage/finance-tracker/commit/750cc80b6dc8f627c6df215759b3230b78577590))
* **transactions:** 페이지네이션 total이 필터를 반영하도록 + limit/offset 검증 ([#81](https://github.com/VinylStage/finance-tracker/issues/81)) ([#98](https://github.com/VinylStage/finance-tracker/issues/98)) ([e0c49a5](https://github.com/VinylStage/finance-tracker/commit/e0c49a568d69220bd7405949c9e50057b6f7bb09))


### Maintenance

* **docs:** 브랜치 보호 규칙 및 bypass 조건 문서화 ([#69](https://github.com/VinylStage/finance-tracker/issues/69)) ([#74](https://github.com/VinylStage/finance-tracker/issues/74)) ([c4ee927](https://github.com/VinylStage/finance-tracker/commit/c4ee9277777922bad184ebcb3183833d13e550c0))
* **errors:** 500 응답에서 내부 메시지 노출 제거 (36곳) ([#84](https://github.com/VinylStage/finance-tracker/issues/84)) ([#101](https://github.com/VinylStage/finance-tracker/issues/101)) ([dbd1fb7](https://github.com/VinylStage/finance-tracker/commit/dbd1fb7009f216f1a44ed4d4a33caa394184017b))
* **hygiene:** 죽은 코드 제거, N+1 쿼리 제거, KIS TODO 정리, 리볼빙 인덱스 문서화 ([#87](https://github.com/VinylStage/finance-tracker/issues/87)) ([#109](https://github.com/VinylStage/finance-tracker/issues/109)) ([4635993](https://github.com/VinylStage/finance-tracker/commit/4635993511606e16f058bf341a0dffc9bd88ea8f))
* **opencode:** 프로젝트 레벨 로컬 에이전트 설정 추가 ([#70](https://github.com/VinylStage/finance-tracker/issues/70)) ([37785ed](https://github.com/VinylStage/finance-tracker/commit/37785ede6bb32ee423b63b70139461e85e875d25))
* **validation:** 입력 검증 일괄 보강 — amount 타입, PUT 필수/404, 설정 숫자, LIKE 이스케이프 ([#82](https://github.com/VinylStage/finance-tracker/issues/82)) ([#99](https://github.com/VinylStage/finance-tracker/issues/99)) ([309ce01](https://github.com/VinylStage/finance-tracker/commit/309ce01b220f67723f846ffe1bf18624eb3c3f1d))


### Documentation

* **adr:** xlsx 취약점 리스크 수용 결정 기록 ([#64](https://github.com/VinylStage/finance-tracker/issues/64)) ([#71](https://github.com/VinylStage/finance-tracker/issues/71)) ([ee55ffd](https://github.com/VinylStage/finance-tracker/commit/ee55ffddbd0f13f70742600d48f7df1aedb9f9fb))

## [0.4.0](https://github.com/VinylStage/finance-tracker/compare/v0.3.0...v0.4.0) (2026-07-24)


### Features

* **data:** add transaction backup/restore (append/overwrite) ([#52](https://github.com/VinylStage/finance-tracker/issues/52)) ([0458395](https://github.com/VinylStage/finance-tracker/commit/04583957f62927952ee757c2af65d7e95a21d7be)), closes [#34](https://github.com/VinylStage/finance-tracker/issues/34)
* **guide:** UI 가이드 페이지 추가 및 마크다운 문서화 ([#56](https://github.com/VinylStage/finance-tracker/issues/56)) ([#63](https://github.com/VinylStage/finance-tracker/issues/63)) ([d7d160e](https://github.com/VinylStage/finance-tracker/commit/d7d160ef40c12e233a19c2bb4b129ea140850e92))
* **import:** 카드사 엑셀 임포트 (농협·롯데·삼성·하나·현대) ([#55](https://github.com/VinylStage/finance-tracker/issues/55)) ([0579344](https://github.com/VinylStage/finance-tracker/commit/05793442394bc00880c6cc6d7369b9eefea10fd7))
* **transactions:** shift+클릭 체크박스 범위선택 ([#61](https://github.com/VinylStage/finance-tracker/issues/61)) ([7f1221b](https://github.com/VinylStage/finance-tracker/commit/7f1221bbde557807d1075a3deae86f87aa3913cd))
* 거래 일괄삭제 및 전체 초기화 기능 ([#60](https://github.com/VinylStage/finance-tracker/issues/60)) ([01cb9d4](https://github.com/VinylStage/finance-tracker/commit/01cb9d48125d6a042f2017b3a35747aa2dc5cf1a))


### Bug Fixes

* **card-import:** 승인번호 기반 중복 체크로 오탐 방지 ([#57](https://github.com/VinylStage/finance-tracker/issues/57)) ([#62](https://github.com/VinylStage/finance-tracker/issues/62)) ([b6472ec](https://github.com/VinylStage/finance-tracker/commit/b6472ec0d40b8b0e9325d1622b0988f561340138))
* **ci:** release-please 워크플로우 자기 재트리거 루프 방지 ([#58](https://github.com/VinylStage/finance-tracker/issues/58)) ([2d4e37d](https://github.com/VinylStage/finance-tracker/commit/2d4e37d37fa0e6e92cbbe9d025c7c010c583d674))


### Maintenance

* **release:** merge develop into main for v0.4.0 release ([c2fc72c](https://github.com/VinylStage/finance-tracker/commit/c2fc72cb35342c8bc12b8cf9309e0a20749b4629))

## [0.3.0](https://github.com/VinylStage/finance-tracker/compare/v0.2.1...v0.3.0) (2026-07-23)


### Features

* automated weekly maintenance audit workflow ([#23](https://github.com/VinylStage/finance-tracker/issues/23)) ([64fefdd](https://github.com/VinylStage/finance-tracker/commit/64fefdd6bdeea46dd4502d115854fb7b2471f498))
* category auto-suggest UX polish ([#4](https://github.com/VinylStage/finance-tracker/issues/4)) ([536093a](https://github.com/VinylStage/finance-tracker/commit/536093ad666d2b8540bb13e4dbefe9aa98250a16))
* **csv-import:** add card statement CSV import preview (hana/samsung/hyundai/shinhan) ([4a85ef8](https://github.com/VinylStage/finance-tracker/commit/4a85ef8b2f547c82599ddae7d60c9c65c656282b))
* **exchange:** add ECOS/Exim external API services and exchange rate route ([b7a0510](https://github.com/VinylStage/finance-tracker/commit/b7a05109cc266209af9a4acefa9f0ca42f20902b))
* local Ollama research script for GitHub issues ([#26](https://github.com/VinylStage/finance-tracker/issues/26)) ([161ff1b](https://github.com/VinylStage/finance-tracker/commit/161ff1b4ff8687caa1ba1383b2f0ffa40e3d45e3))
* minus-tongjang debts, transaction grouping, dashboard charts ([14cbe21](https://github.com/VinylStage/finance-tracker/commit/14cbe210b4b08402c3c061e650be801a26fefe48)), closes [#12](https://github.com/VinylStage/finance-tracker/issues/12) [#13](https://github.com/VinylStage/finance-tracker/issues/13) [#14](https://github.com/VinylStage/finance-tracker/issues/14)
* **phase2:** installments, revolving, debts UI ([f72080e](https://github.com/VinylStage/finance-tracker/commit/f72080e9032a502381d97dc3655a80e6c0803092)), closes [#1](https://github.com/VinylStage/finance-tracker/issues/1) [#2](https://github.com/VinylStage/finance-tracker/issues/2) [#3](https://github.com/VinylStage/finance-tracker/issues/3)
* **phase4:** category expense chart with period + bar/line toggle ([edc331d](https://github.com/VinylStage/finance-tracker/commit/edc331d4cda7ba3088315049454de0df12909f6b)), closes [#6](https://github.com/VinylStage/finance-tracker/issues/6)
* **phase4:** dedicated cashflow endpoint + month-over-month comparison ([1de14ad](https://github.com/VinylStage/finance-tracker/commit/1de14adf9783b90b5dc4d596ad6cb9f7cfe0c88d)), closes [#5](https://github.com/VinylStage/finance-tracker/issues/5)
* **phase5:** balance simulator ([9aac83d](https://github.com/VinylStage/finance-tracker/commit/9aac83d1eb5808e0dece53ab55e875e34f6db788)), closes [#7](https://github.com/VinylStage/finance-tracker/issues/7)
* **phase5:** savings/insurance ledger with maturity handling ([24b2549](https://github.com/VinylStage/finance-tracker/commit/24b25495e32fcf0962d6b0ccd017cc0ff9fa278e)), closes [#16](https://github.com/VinylStage/finance-tracker/issues/16)
* **phase6:** CSV/JSON export + settings page ([9d7233c](https://github.com/VinylStage/finance-tracker/commit/9d7233cb3efa53e5525b8cef3cb925d96fd3cea4)), closes [#8](https://github.com/VinylStage/finance-tracker/issues/8) [#9](https://github.com/VinylStage/finance-tracker/issues/9)
* **settings:** add category/payment-method edit and reactivate UI ([d9bd5cb](https://github.com/VinylStage/finance-tracker/commit/d9bd5cb4eaa544a9b8b5b4c3314c3d2232bf61a2))
* **settings:** add settings-only backup and restore ([966e3d7](https://github.com/VinylStage/finance-tracker/commit/966e3d7fe189e2b0442f56eaa1904197f4be5d81))
* **stocks:** add KIS API stub (disabled) ([5288401](https://github.com/VinylStage/finance-tracker/commit/5288401e106c6753a3fd5944c2731808469cc0e5))
* 기간 비교 차트 (일/주/월/연 전기간 대비) ([f009d1f](https://github.com/VinylStage/finance-tracker/commit/f009d1f0b82ec20dd6f1f7f30ee0f7950ce1ef26)), closes [#27](https://github.com/VinylStage/finance-tracker/issues/27)
* 데이터 내보내기 및 마이그레이션 지원 (CSV/JSON) ([d2e8853](https://github.com/VinylStage/finance-tracker/commit/d2e8853e6ab3602f90ca699653de37ba948d9ac9)), closes [#28](https://github.com/VinylStage/finance-tracker/issues/28)


### Bug Fixes

* **dashboard:** replace daily-expense bar chart with area chart ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* **deps:** upgrade vite to 6.4.3, resolve client audit vulnerabilities ([d397f4d](https://github.com/VinylStage/finance-tracker/commit/d397f4ddff263a4379122b98ab87f84f0fe29282))
* **env:** add missing env vars to .env.example ([45ac22e](https://github.com/VinylStage/finance-tracker/commit/45ac22e7e4c58eedaf6d1c4a312c694e7944e279))
* **phase6:** mobile nav overflow + performance verification ([0dfeabb](https://github.com/VinylStage/finance-tracker/commit/0dfeabbcb20947533ee3032536a17fc4925d73a7)), closes [#17](https://github.com/VinylStage/finance-tracker/issues/17)
* release-please target-branch 고정 및 v0.2.1 버전 정상화 ([#44](https://github.com/VinylStage/finance-tracker/issues/44)) ([2a26de9](https://github.com/VinylStage/finance-tracker/commit/2a26de92726cb61a607c7a213f20e10ceeb7324f))


### Maintenance

* add branch workflow, CONTRIBUTING.md, release-please setup ([#35](https://github.com/VinylStage/finance-tracker/issues/35)) ([1a5063d](https://github.com/VinylStage/finance-tracker/commit/1a5063def601db5850e542f161419570b755578b))
* add GitHub SDLC templates (ISO 12207 기반) ([834b768](https://github.com/VinylStage/finance-tracker/commit/834b7683cdd6990cb033b7882e9f594f061af14c)), closes [#21](https://github.com/VinylStage/finance-tracker/issues/21)
* better-sqlite3 v11→v13 업그레이드 ([#24](https://github.com/VinylStage/finance-tracker/issues/24)) ([281d42a](https://github.com/VinylStage/finance-tracker/commit/281d42a37df0df49bb01f64d4b7341e64e5c90a7))
* **ci:** add GitHub Actions CI workflow (build + syntax check) ([#39](https://github.com/VinylStage/finance-tracker/issues/39)) ([e090da9](https://github.com/VinylStage/finance-tracker/commit/e090da941a5c977aea3591ef281d437616f233b7)), closes [#30](https://github.com/VinylStage/finance-tracker/issues/30)
* develop 브랜치 전략 도입 ([#40](https://github.com/VinylStage/finance-tracker/issues/40)) ([#42](https://github.com/VinylStage/finance-tracker/issues/42)) ([f0b4109](https://github.com/VinylStage/finance-tracker/commit/f0b4109f6ebb134041987f4fa5e03c608a9045cc))
* initial project scaffold (Phase 0+1 complete) ([406ae1b](https://github.com/VinylStage/finance-tracker/commit/406ae1be10003036b267ade14fdbee3ecf33c2ce))
* **main:** release 0.2.0 ([#38](https://github.com/VinylStage/finance-tracker/issues/38)) ([42b0dfe](https://github.com/VinylStage/finance-tracker/commit/42b0dfe9aed6d5138820ed817364293eed8a2011))
* **maintenance:** upgrade React 18 -&gt; 19 + Tailwind v3 -&gt; v4 ([0e3c5cb](https://github.com/VinylStage/finance-tracker/commit/0e3c5cbcf9917e090f5605d8343647a4102de388)), closes [#20](https://github.com/VinylStage/finance-tracker/issues/20)
* **maintenance:** upgrade recharts v2 -&gt; v3 ([9ee762a](https://github.com/VinylStage/finance-tracker/commit/9ee762aa06ce59c5b64f3bcf3e463f6fc3bb33f8)), closes [#18](https://github.com/VinylStage/finance-tracker/issues/18)
* release v0.2.2 ([#47](https://github.com/VinylStage/finance-tracker/issues/47)) ([51b4f0d](https://github.com/VinylStage/finance-tracker/commit/51b4f0d4bc945f9863524a943d597f1c86a61011))
* remove GITHUB_ISSUES.md, migrate to GitHub Milestones ([df31385](https://github.com/VinylStage/finance-tracker/commit/df31385d60ed60057325672b99f7e6cb83b3af94))
* remove internal planning/design docs for public release ([22b65d1](https://github.com/VinylStage/finance-tracker/commit/22b65d1bc03aeae62ddafb6eea147fda18d46573))
* remove node_modules/public from tracking, add .env.example ([cb2ad3c](https://github.com/VinylStage/finance-tracker/commit/cb2ad3c95f30fff37205d5af549aa75aa7089615))
* remove xlsx (migration complete, no longer needed) ([c630653](https://github.com/VinylStage/finance-tracker/commit/c6306535cda851d00a0a7a91e7d1aa8e2ee4c348))
* remove xlsx migration path, seed generic categories/payment methods ([#22](https://github.com/VinylStage/finance-tracker/issues/22)) ([20a2519](https://github.com/VinylStage/finance-tracker/commit/20a251994624a3be70ad3e1644361679afe7bd2c))
* **server:** mount exchange, stocks, csv-import routes ([f877ebf](https://github.com/VinylStage/finance-tracker/commit/f877ebfed7288734a719b35c5bd097e38ed87f53))
* vite/plugin-react 업그레이드 ([#25](https://github.com/VinylStage/finance-tracker/issues/25)) ([938db53](https://github.com/VinylStage/finance-tracker/commit/938db531123f60a4d33877bdeda09dcd2084d38f))
* 이슈 우선순위 라벨 시스템 도입 ([#37](https://github.com/VinylStage/finance-tracker/issues/37)) ([b2d3bd5](https://github.com/VinylStage/finance-tracker/commit/b2d3bd57f7a5dd216edb826a10e473481271dc1f))


### Documentation

* add docs/diagrams/ — 5 Mermaid process diagrams (system ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* add GitHub Issues draft reference (Phase 2-6) ([9e001cf](https://github.com/VinylStage/finance-tracker/commit/9e001cf9250630bdcf189c5438ecbd83f84f8ca0))
* add multi-agent team org & protocols (AGENTS.md) ([96b789a](https://github.com/VinylStage/finance-tracker/commit/96b789ae0b3cc49d8e7fe78df8c16e569da9a93c))
* **adr:** add 0001-transaction-table-separation.md ([0fa7239](https://github.com/VinylStage/finance-tracker/commit/0fa7239880ff87117c895bd6532f40a5e1d5a1c8))
* **adr:** add 0002-sqlite-choice.md ([ede5b82](https://github.com/VinylStage/finance-tracker/commit/ede5b82a75e687dc368a378ddac5a8ded045f344))
* **api:** add API.md ([7089470](https://github.com/VinylStage/finance-tracker/commit/7089470571c83c1828173fc80d1967652bcc31fe))
* ARCHITECTURE.md 한국어 변환, 이슈 기반 프로세스 도입 ([44031c9](https://github.com/VinylStage/finance-tracker/commit/44031c9c68ff766b3be8420b745d856e2a9b8e74))
* **architecture:** add ARCHITECTURE.md ([e63e29a](https://github.com/VinylStage/finance-tracker/commit/e63e29ab657c9eaa7522549d78a4f942507c894c))
* **architecture:** add ARCHITECTURE.md ([a400fcc](https://github.com/VinylStage/finance-tracker/commit/a400fcc88c025379efa2681e8e8261bc8897c290))
* **audit:** add IMPLEMENTATION_AUDIT.md ([33538c4](https://github.com/VinylStage/finance-tracker/commit/33538c4c46a3bc245f0e6e8f6a9549133b1edf82))
* **changelog:** add CHANGELOG.md ([1489f7e](https://github.com/VinylStage/finance-tracker/commit/1489f7e1c934435524f6caa5cf1275c0dea1fbb3))
* **data-model:** add DATA_MODEL.md ([9b160e8](https://github.com/VinylStage/finance-tracker/commit/9b160e8826b46f612e3e9f73169322e7f871ecf8))
* README 한국어 전환 ([571030f](https://github.com/VinylStage/finance-tracker/commit/571030f1f1e3dd7edab2d7a2d586f28adf2c44fb))
* remove deprecated Korean-named docs, English only ([1e0fb5e](https://github.com/VinylStage/finance-tracker/commit/1e0fb5e66fdd520e8c1d1bdc8826514689a76c72))
* **requirements:** add REQUIREMENTS.md ([51662f5](https://github.com/VinylStage/finance-tracker/commit/51662f5cfefb7979e87303f43cf6383bdee492e7))
* **roadmap:** add ROADMAP.md ([19a659d](https://github.com/VinylStage/finance-tracker/commit/19a659d985b6a93520aaa71904da0690897ebd06))
* translate REQUIREMENTS.md and AGENTS.md content to Korean ([a2a919d](https://github.com/VinylStage/finance-tracker/commit/a2a919d0e76d3808057fba262dc541a939862392))
* translate ROADMAP.md content to Korean ([767f122](https://github.com/VinylStage/finance-tracker/commit/767f122d5b4cc590af04e2af140777848d03411c))

## [0.2.1](https://github.com/VinylStage/finance-tracker/compare/v0.2.0...v0.2.1) (2026-07-23)


### Maintenance

* develop 브랜치 전략 도입 ([#40](https://github.com/VinylStage/finance-tracker/issues/40)) ([500e28e](https://github.com/VinylStage/finance-tracker/commit/500e28e48ed12f040dd4067421368b910fd0b94c))

## [0.2.0](https://github.com/VinylStage/finance-tracker/compare/v0.1.0...v0.2.0) (2026-07-23)


### Features

* automated weekly maintenance audit workflow ([#23](https://github.com/VinylStage/finance-tracker/issues/23)) ([64fefdd](https://github.com/VinylStage/finance-tracker/commit/64fefdd6bdeea46dd4502d115854fb7b2471f498))
* category auto-suggest UX polish ([#4](https://github.com/VinylStage/finance-tracker/issues/4)) ([536093a](https://github.com/VinylStage/finance-tracker/commit/536093ad666d2b8540bb13e4dbefe9aa98250a16))
* **csv-import:** add card statement CSV import preview (hana/samsung/hyundai/shinhan) ([4a85ef8](https://github.com/VinylStage/finance-tracker/commit/4a85ef8b2f547c82599ddae7d60c9c65c656282b))
* **exchange:** add ECOS/Exim external API services and exchange rate route ([b7a0510](https://github.com/VinylStage/finance-tracker/commit/b7a05109cc266209af9a4acefa9f0ca42f20902b))
* local Ollama research script for GitHub issues ([#26](https://github.com/VinylStage/finance-tracker/issues/26)) ([161ff1b](https://github.com/VinylStage/finance-tracker/commit/161ff1b4ff8687caa1ba1383b2f0ffa40e3d45e3))
* minus-tongjang debts, transaction grouping, dashboard charts ([14cbe21](https://github.com/VinylStage/finance-tracker/commit/14cbe210b4b08402c3c061e650be801a26fefe48)), closes [#12](https://github.com/VinylStage/finance-tracker/issues/12) [#13](https://github.com/VinylStage/finance-tracker/issues/13) [#14](https://github.com/VinylStage/finance-tracker/issues/14)
* **phase2:** installments, revolving, debts UI ([f72080e](https://github.com/VinylStage/finance-tracker/commit/f72080e9032a502381d97dc3655a80e6c0803092)), closes [#1](https://github.com/VinylStage/finance-tracker/issues/1) [#2](https://github.com/VinylStage/finance-tracker/issues/2) [#3](https://github.com/VinylStage/finance-tracker/issues/3)
* **phase4:** category expense chart with period + bar/line toggle ([edc331d](https://github.com/VinylStage/finance-tracker/commit/edc331d4cda7ba3088315049454de0df12909f6b)), closes [#6](https://github.com/VinylStage/finance-tracker/issues/6)
* **phase4:** dedicated cashflow endpoint + month-over-month comparison ([1de14ad](https://github.com/VinylStage/finance-tracker/commit/1de14adf9783b90b5dc4d596ad6cb9f7cfe0c88d)), closes [#5](https://github.com/VinylStage/finance-tracker/issues/5)
* **phase5:** balance simulator ([9aac83d](https://github.com/VinylStage/finance-tracker/commit/9aac83d1eb5808e0dece53ab55e875e34f6db788)), closes [#7](https://github.com/VinylStage/finance-tracker/issues/7)
* **phase5:** savings/insurance ledger with maturity handling ([24b2549](https://github.com/VinylStage/finance-tracker/commit/24b25495e32fcf0962d6b0ccd017cc0ff9fa278e)), closes [#16](https://github.com/VinylStage/finance-tracker/issues/16)
* **phase6:** CSV/JSON export + settings page ([9d7233c](https://github.com/VinylStage/finance-tracker/commit/9d7233cb3efa53e5525b8cef3cb925d96fd3cea4)), closes [#8](https://github.com/VinylStage/finance-tracker/issues/8) [#9](https://github.com/VinylStage/finance-tracker/issues/9)
* **settings:** add category/payment-method edit and reactivate UI ([d9bd5cb](https://github.com/VinylStage/finance-tracker/commit/d9bd5cb4eaa544a9b8b5b4c3314c3d2232bf61a2))
* **settings:** add settings-only backup and restore ([966e3d7](https://github.com/VinylStage/finance-tracker/commit/966e3d7fe189e2b0442f56eaa1904197f4be5d81))
* **stocks:** add KIS API stub (disabled) ([5288401](https://github.com/VinylStage/finance-tracker/commit/5288401e106c6753a3fd5944c2731808469cc0e5))
* 기간 비교 차트 (일/주/월/연 전기간 대비) ([f009d1f](https://github.com/VinylStage/finance-tracker/commit/f009d1f0b82ec20dd6f1f7f30ee0f7950ce1ef26)), closes [#27](https://github.com/VinylStage/finance-tracker/issues/27)
* 데이터 내보내기 및 마이그레이션 지원 (CSV/JSON) ([d2e8853](https://github.com/VinylStage/finance-tracker/commit/d2e8853e6ab3602f90ca699653de37ba948d9ac9)), closes [#28](https://github.com/VinylStage/finance-tracker/issues/28)


### Bug Fixes

* **dashboard:** replace daily-expense bar chart with area chart ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* **deps:** upgrade vite to 6.4.3, resolve client audit vulnerabilities ([d397f4d](https://github.com/VinylStage/finance-tracker/commit/d397f4ddff263a4379122b98ab87f84f0fe29282))
* **env:** add missing env vars to .env.example ([45ac22e](https://github.com/VinylStage/finance-tracker/commit/45ac22e7e4c58eedaf6d1c4a312c694e7944e279))
* **phase6:** mobile nav overflow + performance verification ([0dfeabb](https://github.com/VinylStage/finance-tracker/commit/0dfeabbcb20947533ee3032536a17fc4925d73a7)), closes [#17](https://github.com/VinylStage/finance-tracker/issues/17)


### Maintenance

* add branch workflow, CONTRIBUTING.md, release-please setup ([#35](https://github.com/VinylStage/finance-tracker/issues/35)) ([1a5063d](https://github.com/VinylStage/finance-tracker/commit/1a5063def601db5850e542f161419570b755578b))
* add GitHub SDLC templates (ISO 12207 기반) ([834b768](https://github.com/VinylStage/finance-tracker/commit/834b7683cdd6990cb033b7882e9f594f061af14c)), closes [#21](https://github.com/VinylStage/finance-tracker/issues/21)
* better-sqlite3 v11→v13 업그레이드 ([#24](https://github.com/VinylStage/finance-tracker/issues/24)) ([281d42a](https://github.com/VinylStage/finance-tracker/commit/281d42a37df0df49bb01f64d4b7341e64e5c90a7))
* initial project scaffold (Phase 0+1 complete) ([406ae1b](https://github.com/VinylStage/finance-tracker/commit/406ae1be10003036b267ade14fdbee3ecf33c2ce))
* **maintenance:** upgrade React 18 -&gt; 19 + Tailwind v3 -&gt; v4 ([0e3c5cb](https://github.com/VinylStage/finance-tracker/commit/0e3c5cbcf9917e090f5605d8343647a4102de388)), closes [#20](https://github.com/VinylStage/finance-tracker/issues/20)
* **maintenance:** upgrade recharts v2 -&gt; v3 ([9ee762a](https://github.com/VinylStage/finance-tracker/commit/9ee762aa06ce59c5b64f3bcf3e463f6fc3bb33f8)), closes [#18](https://github.com/VinylStage/finance-tracker/issues/18)
* remove GITHUB_ISSUES.md, migrate to GitHub Milestones ([df31385](https://github.com/VinylStage/finance-tracker/commit/df31385d60ed60057325672b99f7e6cb83b3af94))
* remove internal planning/design docs for public release ([22b65d1](https://github.com/VinylStage/finance-tracker/commit/22b65d1bc03aeae62ddafb6eea147fda18d46573))
* remove node_modules/public from tracking, add .env.example ([cb2ad3c](https://github.com/VinylStage/finance-tracker/commit/cb2ad3c95f30fff37205d5af549aa75aa7089615))
* remove xlsx (migration complete, no longer needed) ([c630653](https://github.com/VinylStage/finance-tracker/commit/c6306535cda851d00a0a7a91e7d1aa8e2ee4c348))
* remove xlsx migration path, seed generic categories/payment methods ([#22](https://github.com/VinylStage/finance-tracker/issues/22)) ([20a2519](https://github.com/VinylStage/finance-tracker/commit/20a251994624a3be70ad3e1644361679afe7bd2c))
* **server:** mount exchange, stocks, csv-import routes ([f877ebf](https://github.com/VinylStage/finance-tracker/commit/f877ebfed7288734a719b35c5bd097e38ed87f53))
* vite/plugin-react 업그레이드 ([#25](https://github.com/VinylStage/finance-tracker/issues/25)) ([938db53](https://github.com/VinylStage/finance-tracker/commit/938db531123f60a4d33877bdeda09dcd2084d38f))
* 이슈 우선순위 라벨 시스템 도입 ([#37](https://github.com/VinylStage/finance-tracker/issues/37)) ([b2d3bd5](https://github.com/VinylStage/finance-tracker/commit/b2d3bd57f7a5dd216edb826a10e473481271dc1f))


### Documentation

* add docs/diagrams/ — 5 Mermaid process diagrams (system ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* add GitHub Issues draft reference (Phase 2-6) ([9e001cf](https://github.com/VinylStage/finance-tracker/commit/9e001cf9250630bdcf189c5438ecbd83f84f8ca0))
* add multi-agent team org & protocols (AGENTS.md) ([96b789a](https://github.com/VinylStage/finance-tracker/commit/96b789ae0b3cc49d8e7fe78df8c16e569da9a93c))
* **adr:** add 0001-transaction-table-separation.md ([0fa7239](https://github.com/VinylStage/finance-tracker/commit/0fa7239880ff87117c895bd6532f40a5e1d5a1c8))
* **adr:** add 0002-sqlite-choice.md ([ede5b82](https://github.com/VinylStage/finance-tracker/commit/ede5b82a75e687dc368a378ddac5a8ded045f344))
* **api:** add API.md ([7089470](https://github.com/VinylStage/finance-tracker/commit/7089470571c83c1828173fc80d1967652bcc31fe))
* ARCHITECTURE.md 한국어 변환, 이슈 기반 프로세스 도입 ([44031c9](https://github.com/VinylStage/finance-tracker/commit/44031c9c68ff766b3be8420b745d856e2a9b8e74))
* **architecture:** add ARCHITECTURE.md ([e63e29a](https://github.com/VinylStage/finance-tracker/commit/e63e29ab657c9eaa7522549d78a4f942507c894c))
* **architecture:** add ARCHITECTURE.md ([a400fcc](https://github.com/VinylStage/finance-tracker/commit/a400fcc88c025379efa2681e8e8261bc8897c290))
* **audit:** add IMPLEMENTATION_AUDIT.md ([33538c4](https://github.com/VinylStage/finance-tracker/commit/33538c4c46a3bc245f0e6e8f6a9549133b1edf82))
* **changelog:** add CHANGELOG.md ([1489f7e](https://github.com/VinylStage/finance-tracker/commit/1489f7e1c934435524f6caa5cf1275c0dea1fbb3))
* **data-model:** add DATA_MODEL.md ([9b160e8](https://github.com/VinylStage/finance-tracker/commit/9b160e8826b46f612e3e9f73169322e7f871ecf8))
* README 한국어 전환 ([571030f](https://github.com/VinylStage/finance-tracker/commit/571030f1f1e3dd7edab2d7a2d586f28adf2c44fb))
* remove deprecated Korean-named docs, English only ([1e0fb5e](https://github.com/VinylStage/finance-tracker/commit/1e0fb5e66fdd520e8c1d1bdc8826514689a76c72))
* **requirements:** add REQUIREMENTS.md ([51662f5](https://github.com/VinylStage/finance-tracker/commit/51662f5cfefb7979e87303f43cf6383bdee492e7))
* **roadmap:** add ROADMAP.md ([19a659d](https://github.com/VinylStage/finance-tracker/commit/19a659d985b6a93520aaa71904da0690897ebd06))
* translate REQUIREMENTS.md and AGENTS.md content to Korean ([a2a919d](https://github.com/VinylStage/finance-tracker/commit/a2a919d0e76d3808057fba262dc541a939862392))
* translate ROADMAP.md content to Korean ([767f122](https://github.com/VinylStage/finance-tracker/commit/767f122d5b4cc590af04e2af140777848d03411c))

## [Unreleased]

### Added
- 기간 비교 차트 (일/주/월/연 전기간 대비)
- 데이터 내보내기 및 마이그레이션 지원 (CSV/JSON)
- Automated weekly maintenance audit workflow
- Local Ollama research script for GitHub issues
- GitHub SDLC templates (ISO 12207 기반)
- Multi-agent team org & protocols (AGENTS.md)
- GitHub Issues draft reference (Phase 2-6)
- ROADMAP.md with roadmap content
- ARCHITECTURE.md with architecture information
- DATA_MODEL.md with data model information
- API.md with API documentation
- REQUIREMENTS.md with requirements
- ADRs (0001-transaction-table-separation.md, 0002-sqlite-choice.md)

### Changed
- Dashboard: replace daily-expense bar chart with area chart
- README: Korean translation
- ROADMAP.md: Korean translation
- ARCHITECTURE.md: Korean translation and issue-based process introduction
- UI: Installments, revolving, debts
- Category auto-suggest UX polish
- Cashflow endpoint with month-over-month comparison
- Category expense chart with period + bar/line toggle
- Balance simulator
- Savings/insurance ledger with maturity handling
- Mobile nav overflow + performance verification
- React from v18 to v19
- Tailwind from v3 to v4
- Recharts from v2 to v3
- Vite from v6.4.3 to 6.4.3 (upgrade dependencies)
- better-sqlite3 from v11 to v13

### Fixed
- Dependencies: upgrade vite to resolve client audit vulnerabilities

### Deprecated
- Node_modules/public from tracking
- XLSX (migration complete, no longer needed)
- Internal planning/design docs for public release
- GITHUB_ISSUES.md, migrated to GitHub Milestones
