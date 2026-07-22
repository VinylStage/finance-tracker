# 0001: Transaction Table Separation

## Context and Problem Statement

Finance-tracker은 설치형 애플리케이션으로, 사용자가 금융 거래 내역을 관리하고 분석할 수 있도록 합니다. 초기 설계에서는 모든 거래 내용을 단일 `transactions` 테이블에 저장하는 방식을 채택했습니다. 하지만 특정 유형의 거래(예: 할부 결제 및 리볼빙 결제)는 이 방식으로 인해 이중 계산 문제가 발생합니다.

이중 계산 문제란, 한笔 금융 거래가 여러 번 집계되는 현상을 의미합니다. 예를 들어, 할부 결제의 경우 원천 결제액은 `transactions` 테이블에 기록되고, 이후 매달 납입되는 할부금은 `transactions` 테이블에 또다시 기록되어 총 금액이 과대 집계되는 문제가 있습니다. 이는 사용자의 재정 상태를 잘못 보여줄 수 있어 문제입니다.

## Considered Options

1. **단일 transactions 테이블 유지** - 기존 방식을 유지하면서 `payment_style` 컬럼에 할부/리볼빙 구분 값을 추가하여 구분하는 방식
2. **단일 transactions 테이블에 flag 컬럼으로 구분** - `transactions` 테이블 내에 boolean 값 혹은 enum으로 구분하여 이중 계산을 피하는 방식  
3. **할부 및 리볼빙 거래용 별도 테이블 분리** - 할부 결제 및 리볼빙 결제 정보를 `installments` 및 `revolving_history` 테이블로 분리하여 저장하고, `transactions` 테이블에서는 일반적인 단발 결제 정보만 기록하는 방식

## Decision Outcome

현재 `src/db/init.js`에 정의된 데이터베이스 구조를 보면, 할부 결제는 `installments` 테이블에, 리볼빙 결제는 `revolving_history` 테이블에 저장되며 `transactions` 테이블은 일반적인 단발 결제 정보만 기록하고 있습니다. 이 설계를 유지하여 **할부 및 리볼빙 거래를 별도의 테이블로 분리하는 방식을 채택**했습니다.

## Consequences

- 장점:
  - `transactions` 테이블에 저장하는 일반 결제 내역은 중복되지 않도록 정돈되어 있어 더 간단하게 사용 가능
  - 개별 테이블로 분리됨으로써, 각각의 데이터 구조가 최적화되고 복잡도가 감소
- 단점:
  - 사용자에게 더 많은 테이블에 대해 이해하고 관리할 필요성이 증가
  - 모든 결제 내역을 한 곳에서 조회하는 것이 복잡해질 수 있음
