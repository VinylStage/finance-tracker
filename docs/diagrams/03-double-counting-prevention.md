# 이중계산 방지 로직 흐름 (할부·리볼빙 분리)

할부·리볼빙 결제는 `transactions` 테이블에 절대 기록하지 않고, 전용 테이블에만 기록해 지출 통계와 분리한다. 상세 설계는 `PHASE2_DESIGN.md` §1 참고.

```mermaid
flowchart TD
    Start["거래 입력"] --> Style{"결제방식 선택"}

    Style -- "일시불" --> TxTable[("transactions 테이블에 기록")]
    Style -- "할부" --> InstallTable[("installments 테이블에만 기록<br/>구매 원건, 개월수, 월납부액")]
    Style -- "리볼빙" --> RevTable[("revolving_history 테이블에만 기록<br/>월별 이월잔액/신규사용/납부액")]

    TxTable --> ExpenseSum["대시보드 지출 집계<br/>payment_style NOT IN (할부, 리볼빙)"]

    InstallTable --> Billing["이번달 청구액 계산<br/>청구시작월이 이번달 이전이고<br/>status = 진행중인 항목 합산"]
    RevTable --> Paid["이번달 paid_amount 집계"]

    ExpenseSum --> Formula["가용현금 =<br/>수입 − 지출(일시불만) −<br/>할부 청구예정 − 리볼빙 납부액"]
    Billing --> Formula
    Paid --> Formula

    style InstallTable fill:#eef2ff,stroke:#6366f1
    style RevTable fill:#eef2ff,stroke:#6366f1
    style TxTable fill:#ecfdf5,stroke:#10b981
    style Formula fill:#fff7ed,stroke:#f59e0b
```

## 왜 분리하는가
`transactions`에 할부·리볼빙 납부를 중복 기록하면, 구매 시점 지출 + 월별 납부 지출이 이중으로 잡혀 실제보다 지출이 부풀려진다. 대시보드는 `installments`/`revolving_history`를 별도 쿼리로 조회해 "이번달 청구 예정" 항목만 가용현금 계산에 반영한다.
