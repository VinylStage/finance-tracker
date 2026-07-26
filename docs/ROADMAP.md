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

## 미결 이슈

- [ ] 다운로드된 차트 이미지의 품질 문제 (Recharts 렌더링)
- [ ] 사용자 로그인 및 계정 시스템 필요
- [ ] 실시간 차트 업데이트 방식 개선