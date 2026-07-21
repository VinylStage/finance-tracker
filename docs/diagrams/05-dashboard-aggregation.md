# 대시보드 데이터 집계 흐름

`Dashboard.jsx` 마운트 시 두 엔드포인트를 병렬 호출하고, 하나의 대시보드 응답 안에서 여러 집계 쿼리가 실행된다.

```mermaid
flowchart TD
    Mount["Dashboard.jsx 마운트"] --> F1["GET /api/transactions/summary/dashboard"]
    Mount --> F2["GET /api/debts"]

    F1 --> Q1["이번달 수입/지출 집계"]
    F1 --> Q2["할부 청구예정 집계"]
    F1 --> Q3["리볼빙 납부액 집계"]
    F1 --> Q4["categoryBreakdown<br/>카테고리별 지출"]
    F1 --> Q5["dailyTrend/weeklyTrend/monthlyTrend<br/>기간별 수입·지출"]
    F1 --> Q6["topMerchants<br/>이번달 상위 5 가맹점"]

    Q1 --> Avail["가용현금 계산<br/>(이중계산 방지 규칙 적용)"]
    Q2 --> Avail
    Q3 --> Avail

    F2 --> TotalDebt["총 부채 합계"]

    Avail --> UI1["요약 카드"]
    Q4 --> UI2["카테고리 도넛차트 +<br/>예산 대비 실적"]
    Q5 --> UI3["흐름 분석<br/>일/주/월/연 영역차트"]
    Q6 --> UI4["Top5 가맹점/카테고리 리스트"]
    TotalDebt --> UI5["부채 잔액 추이<br/>(현재 총 부채 기준 근사)"]
    Q1 --> UI6["순자산 추이<br/>(누적 수지 기준 근사)"]

    style Avail fill:#fff7ed,stroke:#f59e0b
    style UI5 fill:#f8fafc,stroke:#94a3b8,stroke-dasharray: 4 2
    style UI6 fill:#f8fafc,stroke:#94a3b8,stroke-dasharray: 4 2
```

## 근사치 처리 안내
점선으로 표시된 두 항목은 실제 과거 스냅샷 데이터가 없어 근사 계산된다:
- **순자산 추이**: 자산−부채 절대값이 아닌 월별 수입−지출 누적합
- **부채 잔액 추이**: 과거 잔액 이력이 없어 현재 총 부채를 x축 전체에 평평하게 표시

정확한 시계열이 필요하면 잔액 스냅샷 테이블을 별도로 추가해야 한다.
