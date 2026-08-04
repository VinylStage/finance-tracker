# 마이그레이션 체계 이전 스키마 (#369)

이 디렉터리의 `.sql` 은 **`schema_migrations` 도입(#89) 이전의 DB 스키마**다. 데이터는 없다 — `sqlite3 .schema` 출력이라 `CREATE` 문만 들어 있다.

## 왜 파일로 들고 있나 — 코드로 못 만든다

마이그레이션 N 까지 적용한 상태는 `001..N` 을 돌리면 언제든 재현된다. 그러나 **마이그레이션 체계가 생기기 전의 baseline 은 재현할 수 없다.** 그 모양은 당시의 `src/db/init.js` 가 만들었고, 그 파일도 그동안 바뀌었기 때문이다.

원본이 남아 있던 곳은 `.delegation-metrics/` 와 오래된 DB 스냅샷뿐이었다. 둘 다 정리 대상이라, 지워지기 전에 스키마만 떠 왔다(2026-08-04).

**실데이터 사본은 커밋하지 않는다.** 백업 파일에는 실제 가계부 내역이 들어 있고 개당 400KB다.

## 두 변종

같은 9개 테이블을 갖지만 **컬럼이 어떻게 생겼는지가 다르다.**

| 파일 | 원본 | 특징 |
|---|---|---|
| `pre-migrations-altered.sql` | `.delegation-metrics/issue-75/test-with-cardimport.db` 외 2곳 | `approval_number` · `savings_products.category_id` 가 **`ALTER TABLE` 로 붙어 있다.** 실제로 업그레이드를 거친 DB |
| `pre-migrations-fresh.sql` | `.delegation-metrics/xlsx-112/smoketest-server/data/finance.db` | 같은 컬럼이 `CREATE TABLE` 안에 있다. 그 시점의 신규 설치본 |

둘을 다 들고 있는 이유는 마이그레이션들이 `PRAGMA table_info` 로 컬럼 존재를 확인해 분기하기 때문이다. **"컬럼이 이미 있는 경우" 와 "없는 경우" 가 실제로 다른 코드 경로를 탄다.**

## 무엇을 보장하지 않나

`cardImport` 같은 앱 동작을 검증하지 않는다. **마이그레이션 체인이 이 baseline 위에서 끝까지 도는지**만 본다 — `legacy-schema-migration.test.js`.

전수 검증 매트릭스는 만들지 않았다(#369 "범위 밖"). 지금은 로컬 단일 사용자라 대상 DB 가 하나뿐이고, 마이그레이션마다 실거래 사본으로 리허설하는 쪽이 강하다. **배포가 걸리면 그때 이 픽스처가 출발점이 된다.**

## 갱신하지 않는다

이 파일들은 과거의 기록이다. 스키마가 바뀌어도 **고치지 않는다.** 고치면 "그때 실제로 이랬다" 는 사실이 사라진다.
