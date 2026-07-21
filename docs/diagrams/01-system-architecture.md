# 시스템 아키텍처 흐름

브라우저 → Express → SQLite로 이어지는 단일 프로세스 구조. 상세 스택은 `ARCHITECTURE.md` 참고.

```mermaid
flowchart LR
  Browser["브라우저<br/>React SPA"]

  subgraph Server["Express 서버 (localhost:3000)"]
    Static["정적 파일 서빙<br/>public/ (Vite 빌드)"]
    API["REST API 라우터<br/>/api/*"]
  end

  DB[("SQLite<br/>better-sqlite3<br/>data/finance.db")]

  Browser -- "GET / (최초 로드)" --> Static
  Static -- "React 번들" --> Browser

  Browser -- "fetch('/api/...')" --> API
  API -- "prepare().run/get/all" --> DB
  DB -- "결과 row" --> API
  API -- "JSON 응답" --> Browser

  Browser -- "state 갱신 후 리렌더" --> Browser
```

## 참고
- 인증 없음, 단일 사용자, 로컬 전용
- API 라우터: `transactions`, `categories`, `paymentMethods`, `installments`, `revolving`, `debts`
- DB는 파일 하나(WAL 모드) — 백업은 파일 복사로 충분
