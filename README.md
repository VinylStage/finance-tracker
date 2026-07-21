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
npm start
# → http://localhost:3000
```

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

[docs/ROADMAP.md](docs/ROADMAP.md) 참조
