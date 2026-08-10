# Finance Tracker

구글 시트 / 엑셀 대체용 로컬 가계부 웹앱. 실시간 차트와 스마트 카테고리 자동제안 기능 포함.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 런타임 | Node.js |
| 백엔드 | Express |
| 데이터베이스 | SQLite (better-sqlite3) |
| 프론트엔드 | React + Vite |
| 차트 | Recharts |
| 스타일 | Tailwind CSS |

## 빠른 시작

```bash
# 1. 백엔드 의존성 설치
npm install

# 2. 프론트엔드 의존성 설치
cd client && npm install && cd ..

# 3. 프론트엔드 빌드
npm run build

# 4. 서버 시작
NODE_ENV=production npm start
# → http://localhost:3000
```

`NODE_ENV=production`을 권장한다 — 전역 에러 미들웨어(`src/server.js`)가 이미 항상 내부 정보를 감춘 500 응답만 내려보내지만, 방어적으로 Express 자체의 개발용 동작(상세 에러 렌더링 등)도 꺼두는 편이 안전하다.

처음 실행 시 빈 DB로 시작합니다. 기본 카테고리(수입/고정지출/변동필수/선택지출/저축/부채상환)와 결제수단(신용카드/체크카드/현금/계좌이체/간편결제)이 자동으로 세팅되며, **설정** 페이지에서 자유롭게 추가·수정할 수 있습니다.

## 개발 모드

```bash
# 백엔드 (watch 모드)
npm run dev

# 프론트엔드 (Vite HMR)
cd client && npm run dev
# → http://localhost:5173  (/api 요청은 localhost:3000으로 프록시)
```

## 프로젝트 구조

```
finace-tracker/
├── src/
│   ├── server.js           # Express 진입점
│   ├── db/init.js          # SQLite 스키마 + 연결 + 초기 시드
│   └── routes/             # REST API 라우터
├── client/                 # React + Vite 프론트엔드
│   └── src/
│       ├── pages/          # Dashboard, Transactions 등
│       └── components/     # 폼, 리스트 컴포넌트
├── data/                   # SQLite DB 파일 (git 제외)
└── docs/                   # 엔지니어링 문서
```

## 로드맵

**GitHub 이 정본이다.**

- [마일스톤](https://github.com/VinylStage/finance-tracker/milestones) — 무엇을 언제까지
- [열린 이슈](https://github.com/VinylStage/finance-tracker/issues) — 지금 무엇이 남았나
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — 아직 이슈가 아닌 것

전에는 `docs/ROADMAP.md` 가 마일스톤 진행과 구현 목록을 따로 적었는데, 손으로
갱신하는 문서라 **계속 어긋났다.** 마일스톤 번호가 GitHub 과 달라졌고, 마이그레이션
규칙 하나는 코드가 바뀐 뒤에도 옛 내용이 남아 정반대를 지시하고 있었다. 상태를 두 곳에
적으면 한 곳은 반드시 낡는다.

**진행 상태는 GitHub 이 정본이고, 미착수 백로그만 파일로 둔다.** 처음에는 그것도
이슈(#442)에 뒀는데 착수 전에 닫혀서 항목이 통째로 사라질 뻔했다 — 이슈는 닫히면
목록에서 사라지고 흔적이 안 남는다. 파일은 PR 로만 바뀌므로 지우려면 diff 가 남는다.
