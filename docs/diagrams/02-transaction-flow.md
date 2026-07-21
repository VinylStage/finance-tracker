# 거래 입력 흐름 (카테고리 자동제안 포함)

가맹점명 입력 후 blur 시 카테고리를 자동 제안하고, 사용자가 확정한 뒤 저장하는 흐름.

```mermaid
sequenceDiagram
    actor User as 사용자
    participant Form as TransactionForm
    participant API as Express API
    participant DB as SQLite

    User->>Form: 가맹점명 입력
    Form->>Form: blur 이벤트
    Form->>API: GET /api/transactions/suggest/category?merchant=

    API->>DB: merchant 완전 일치 조회<br/>(최근 category_id)
    alt 완전 일치 있음
        DB-->>API: category_id 반환
    else 완전 일치 없음
        API->>DB: merchant LIKE 부분일치 + 빈도 집계
        DB-->>API: 최빈 category_id 반환 (없으면 null)
    end
    API-->>Form: { category_id }

    Form->>Form: 카테고리 드롭다운 자동 선택<br/>(수동 변경 가능)
    User->>Form: 날짜/금액/결제수단/결제방식 입력 후 제출
    Form->>API: POST /api/transactions

    API->>DB: INSERT INTO transactions
    DB-->>API: lastInsertRowid
    API-->>Form: 201 Created

    Form->>Form: 목록 새로고침 + 대시보드 재조회
```

## 참고
- 결제방식이 `할부` 또는 `리볼빙`인 경우 이 흐름을 타지 않고 각각 `installments` / `revolving_history` 테이블로 별도 등록됨 → [03-double-counting-prevention](./03-double-counting-prevention.md)
