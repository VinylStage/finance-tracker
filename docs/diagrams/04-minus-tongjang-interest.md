# 마이너스통장 이자 자가증식 흐름

마이너스통장은 금리가 수시로 바뀌고, 발생한 이자가 원금에 가산되어 다음 이자 계산의 기준이 되는 자가증식 구조다.

```mermaid
flowchart TD
    Register["부채 등록<br/>type = 마이너스통장"] --> Cycle["금리 변동 / 이자 발생 시점"]

    Cycle --> Input["사용자가 이자 추가 입력<br/>날짜 · 현재금리 · 이자금액 · 메모"]
    Input --> Post["POST /api/debts/:id/interest"]

    Post --> Tx{"DB 트랜잭션"}
    Tx --> Log[("debt_interest_log에 이력 저장<br/>rate_at_time, interest_amount,<br/>balance_before, balance_after")]
    Tx --> Update["debts.balance += interest_amount<br/>debts.annual_rate = 입력 금리로 갱신"]

    Update --> NewBalance["잔액 = 원금 + 누적이자"]
    NewBalance -.->|"다음 이자 계산 기준"| Cycle

    Log --> History["GET /api/debts/:id/interest-log<br/>이자 이력 아코디언에 표시"]

    style Register fill:#eef2ff,stroke:#6366f1
    style Update fill:#fff1f2,stroke:#e11d48
    style NewBalance fill:#fff1f2,stroke:#e11d48
```

## 핵심 포인트
- 이자 금액은 사용자가 직접 입력(은행 계산과 별개로 실측값을 기록) — 앱이 자동 계산하지 않음
- `balance_before` / `balance_after`를 함께 저장해 이력 추적 가능
- 부채 삭제 시 `debt_interest_log`도 함께 cascade 삭제 (FK 제약 위반 방지)
