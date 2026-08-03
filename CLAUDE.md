# finance-tracker 작업 규칙

## 세션 첫 스텝 — 실거래 DB 백업

**새 작업 세션을 시작하면 코드를 읽거나 고치기 전에 `data/finance.db` 백업부터 뜬다.**

```bash
sqlite3 data/finance.db ".backup 'data/backups/finance_$(date +%Y%m%d_%H%M%S)_<라벨>.db.bak'"
```

- 명명: `finance_YYYYMMDD_HHMMSS[_라벨].db.bak`
- **`cp` 를 쓰지 않는다.** WAL 이 붙어 있으면 불완전한 스냅샷이 된다. `.backup` 은 WAL 을 반영한 일관 스냅샷을 만든다 (결과 파일의 `-wal` 이 0바이트인 것이 근거)
- 뜬 뒤 `PRAGMA integrity_check` 와 주요 테이블 행수를 원본과 대조해 검증한다
- **이미 백업이 있어도 세션 시작 시점 기준으로 새로 뜬다.** 직전 백업 이후 앱에서 데이터가 더 들어왔을 수 있다
- 실거래 데이터를 고치는 작업이면 라벨을 붙인다 (`_pre-installment-revert` 등)

백업 전에는 DB 에 쓰는 작업을 하지 않는다.

## 실거래 DB 취급

`data/finance.db` 는 **실제 가계부 데이터**다. 테스트 대상이 아니다.

- 파괴적 동작(전체 삭제, overwrite import, 마이그레이션) 검증은 `:memory:` 또는 스크래치 복사본에서만 한다
- 조회만 하더라도 WAL 이 붙은 상태에서 외부 도구로 열면 체크포인트가 발생할 수 있다. 원본을 건드리면 안 되는 상황이면 `db`·`-wal`·`-shm` 셋을 복사해 사본에 쿼리한다
- 과거 실거래 2,212건이 유실된 사고가 있었다. 이 규칙은 판단 대상이 아니라 하드룰이다

## 테스트

```bash
npm test
```

Node 내장 러너(`node --test`). 각 테스트가 `mkdtemp` 로 임시 DB 를 만들고 `DB_PATH` 로 주입하므로 실거래 DB 에 닿지 않는다. 새 테스트를 쓸 때도 이 방식을 따른다.

커버리지 게이트는 `npm run test:coverage` (lines 80 / branches 75 / functions 85 / statements 80).

## 브랜치

**브랜치는 항상 `origin/develop` 에서 딴다.**

이 저장소는 스쿼시 머지를 쓴다. 선행 이슈 브랜치를 베이스로 삼으면 원본 커밋이 남아 develop 과 중복 충돌이 난다 (PR #294 에서 실제로 발생).

머지는 저장소 소유자가 직접 한다. 머지 후 브랜치는 로컬·원격 모두 삭제한다.

## 문서 변경 승인 게이트

다음 경로의 문서는 confirm-chain 승인 없이는 커밋되지 않는다 (`.confirm-chain-paths`).

```
docs/audit/*
docs/design/*
docs/decisions/*
```

승인은 **사람이 한다.** 에이전트가 `--resume approve` 를 대신 실행하지 않는다. 제출까지만 하고 승인을 기다린다.

## 데이터를 고치는 기능

기존 데이터를 대량으로 바꾸는 동작(재생성·재매핑·재분류)은 **프리뷰 → 확인 → 실행** 2단계를 거친다. 프리뷰 단계는 DB 를 바꾸지 않는다.

한 건씩 하는 일반 CRUD 는 해당하지 않는다. 다만 되돌릴 수 없는 동작에는 확인을 받는다.
