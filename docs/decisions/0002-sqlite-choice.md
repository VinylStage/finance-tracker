# 0002: SQLite (better-sqlite3) Choice

## Context and Problem Statement

이 애플리케이션은 로컬 단일 프로세스 웹 앱으로, 사용자는 자신의 재무 정보를 로컬에 저장하고 조회할 수 있어야 한다. SQLite는 로컬 데이터베이스 시스템으로 적합하며, 애플리케이션의 요구사항에 따라 DB 드라이버를 선택해야 한다.

## Considered Options

1. **PostgreSQL/MySQL**: 서버형 DB, 별도 설치 필요. 클라이언트-서버 구조, 네트워크 상의 복잡성 및 보안 문제.
2. **better-sqlite3**: SQLite 드라이버 중 하나. 로컬 파일 기반으로 동작하며 동기 API를 제공함. 설치 요구사항이 없고, 애플리케이션이 사용하는 웹 서버와의 통합도 쉽다.
   - *TODO: 확인 필요* - 다른 node-sqlite3 등 다른 SQLite 드라이버에 대한 비교
3. **SQLite other driver (node-sqlite3)**: 비슷한 기능, 그러나 성능/동기식 vs 비동기식/비효율적 접근의 trade-off.

## Decision Outcome

better-sqlite3를 선택했다. 이는 다음과 같은 이유로 최선의 선택이다:
- 단일 프로세스 웹 앱으로 로컬 DB만 필요
- 별도 DB 서버 설치 및 관리 불필요
- 동기 API가 코드를 단순화하고 디버깅에 유리함
- 설치시 문제가 없으므로 사용자에게 간편함 제공

## Consequences

- 애플리케이션이 실행되는 운영 체제에 따라 SQLite 파일 접근 권한과 관련된 문제 발생 가능성
- DB 복잡성 또는 분산 환경에서는 적합하지 않음. (예: 멀티스레드/분산 시스템)