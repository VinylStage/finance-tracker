# 0004: xlsx (SheetJS) 벤더링 방식 취약점 해소 — 0003 대체

관련 이슈: #112 (선행: #64, ADR 0003)

## Context and Problem Statement

ADR 0003(#64)은 동일한 high 등급 취약점 2건(GHSA-4r6h-8v6p-xvw6 Prototype Pollution, GHSA-5pgg-2g8v-p4x9 ReDoS)에 대해 **옵션 1(리스크 수용)** 을 채택했다. 이후 Dependabot이 동일 건을 계속 재알림하고 있어(#112), 재검토 트리거 발생 여부와 해소 방향을 다시 판단한다.

### 재검토 트리거 재확인 결과

0003이 정의한 4개 트리거를 재검사했다.

| 트리거 | 상태 |
|---|---|
| SheetJS npm 배포 재개 | **미발생** — 재검증 결과는 아래 참조 |
| 취약점 등급이 RCE로 재평가 | 미발생 |
| 사설망 밖 노출 / 다중 사용자 확장 | 미발생 |
| 사용자 본인 외 출처 파일 업로드 | 미발생 |

트리거 자체는 발생하지 않았다. 이 ADR은 트리거 충족이 아니라 **"수용 비용 대비 해소 비용이 역전됐는가"** 를 다시 계산한 결과다 — 아래 옵션 2 재평가 참조.

### npm 패치 부재 3중 재검증 (2026-07-25)

0003 작성 시점의 "npm에 패치가 없다"를 독립 소스 3개로 재확인했다.

1. `npm view xlsx versions` — 전체 108개 배포 버전 중 최고가 `0.18.5`(2022-03-24 배포). 그 이후 npm 배포 이력 없음.
2. `registry.npmjs.org/xlsx` API 원문(CLI 캐시 배제) — `dist-tags.latest = 0.18.5`.
3. **GitHub 공식 Security Advisory API**(Dependabot이 참조하는 바로 그 데이터베이스) — 두 어드바이저리 모두 `first_patched_version: null` (npm 생태계 기준).

즉 Dependabot 재알림은 오탐이 아니라 **"npm에는 정말로 패치가 없다"는 정확한 신호**다. 패치는 SheetJS CDN(`cdn.sheetjs.com`)에만 존재한다(0.19.3에서 Prototype Pollution 수정, 0.20.2에서 ReDoS 수정, 이후 최신은 0.20.3).

## Considered Options

0003과 동일한 3개 옵션을 재평가한다.

### 옵션 1: 리스크 수용 유지

### 옵션 2: CDN 배포판(0.20.3)으로 교체

### 옵션 3: `exceljs` 등 대체 라이브러리로 마이그레이션

## 실증 (Decision Drivers)

세 옵션 모두 코드 대신 **직접 실행한 증거**로 재평가했다. 근거 원자료: `.delegation-metrics/xlsx-112/DELEGATION_LOG.md`(레포 외부, 사내 기록용).

### 옵션 3 기각 — exceljs 파싱 실패 실측

`ref/ref-card-history/` 의 실제 샘플 13개를 판정한 결과, 이 앱이 실제로 받는 카드사 엑셀은 다음 세 가지 내부 포맷이 섞여 있다.

| 실제 포맷 | 개수 | 카드사 |
|---|---|---|
| 진짜 XLSX (ZIP, `50 4B`) | 3 | 농협, 롯데, 삼성 |
| 진짜 BIFF8 (OLE2, `D0 CF 11 E0`) | 3 | 하나 |
| **HTML을 `.xls` 확장자로 위장** | 7 | 현대 |

`exceljs@4.4.0`(jszip/saxes/fast-csv 기반, OLE2·BIFF 파서 없음)으로 13개 샘플을 직접 파싱 시도한 결과:

```
진짜 XLSX 3개: OK
BIFF8(하나) 3개: FAIL — "Can't find end of central directory : is this a zip file?" (2건)
                  또는 워크시트 0개로 에러 없이 "성공"(1건, 즉 무음 데이터 유실)
HTML위장(현대) 7개: FAIL — "Can't find end of central directory : is this a zip file?"
```

**성공 3/13 (23%)**. 특히 하나카드 2건은 예외 없이 워크시트 0개로 끝나 — 마이그레이션했다면 에러 로그 없이 조용히 0건 임포트되는 형태로 나타났을 것이다. 이 앱은 SheetJS의 넓은 포맷 관용성(ZIP+XML / OLE2 BIFF / HTML 테이블 세 가지 모두)에 의존하고 있어, npm에서 유지보수되는 대체 라이브러리로 교체할 수 없다. **옵션 3 기각을 유지한다.**

(참고: `node-xlsx` 는 후보에서 조기 제외 — 내부적으로 SheetJS `xlsx` 자체를 의존성으로 감고 있어 대체가 되지 않는다.)

### 옵션 2 재평가 — 0003이 기각한 근거 재검증

0003은 옵션 2를 (a) 공급망 신뢰 범위 확대, (b) lockfile·CI 예외 처리 비용, (c) 폐쇄망 빌드 영향을 이유로 기각했다. 세 가지를 실측으로 재검토한다.

**동등성 실측 (0.18.5 → 0.20.3 교체가 회귀를 유발하는가)**

1차: raw `XLSX.read` / `XLSX.utils.sheet_to_json(header:1, raw:true, defval:null)` 수준에서 13개 파일 비교 — **SAME 12 / DIFF 1 / ERROR 0**. 유일한 DIFF(농협, 헤더 행)는 셀 내부 개행 정규화(`\r\n`→`\n`)뿐이며 이 앱의 파서는 데이터 행 인덱스 기반이라 무관하다.

2차(결정적): 이 앱의 실제 파서 5개(`parseNonghyupExcel` 등, `cardExcelImport.js`)를 0.18.5와 0.20.3 두 버전으로 각각 실행해 **필드 단위**(date/merchant/amount/is_installment/installment_months/cancelled/approval_number)로 비교했다.

```
총 501개 거래 행(13개 파일 × 5개 카드사), 필드 단위 diff: 0건
```

**패치 적용이 파싱 결과에 아무 영향을 주지 않음이 실측으로 확인됐다.**

**공급망·lockfile·폐쇄망 우려 해소 방법**

0003이 우려한 것은 "원격 URL을 직접 의존성으로 지정"하는 방식이었다. 이번 재검토에서는 이를 실제로 시도한 뒤 대안으로 **레포 벤더링**을 검증했다.

- 원격 URL 방식 시도 결과: **npm 12.0.0의 새 기본값 `allow-remote=none`이 CDN tarball 설치 자체를 차단한다**(`.npmrc` 유무와 무관, npm 자체 기본값). `--allow-remote=root`로 우회 가능하나, 이는 곧 이 레포와 이 레포를 체크아웃하는 모든 환경(CI, 폐쇄망 포함)에 `.npmrc`로 보안 기본값 완화를 강제해야 함을 뜻한다. → 0003의 (b)(c) 우려가 npm 12 기준으로 **더 구체적으로 확인됐다.**
- **벤더링 방식**: `vendor/xlsx-0.20.3.tgz`(CDN에서 1회 내려받은 tarball, 2,409,319 bytes)를 레포에 커밋하고 `package.json`에 `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`로 지정. 실측 결과:
  - `npm install` / `npm ci` 모두 성공, 네트워크·`.npmrc` 예외 불필요.
  - `npm audit` → `found 0 vulnerabilities`.
  - lockfile에 기록된 integrity 해시(`sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`)가 CDN에서 직접 설치했을 때와 **완전히 동일** — 벤더링된 tarball이 CDN 원본과 바이트 단위로 동일함이 교차 증명된다.
  - 폐쇄망 빌드는 오히려 **개선**된다 — 외부 URL 접근이 전혀 필요 없다(0003이 우려한 "폐쇄망에서 별도 아티팩트 반입 절차 필요"가, tarball을 아예 레포에 넣는 방식으로 사전에 해소된다).

즉 0003이 옵션 2를 기각한 세 근거 중 (b)(c)는 **원격 URL 방식**에 대해서는 여전히(오히려 더 구체적으로) 유효하지만, **벤더링 방식**에는 적용되지 않는다. (a) 공급망 신뢰 범위 확대는 "CDN을 설치 시점마다 신뢰"에서 "CDN에서 1회 받은 특정 바이트를 리뷰·커밋해 고정"으로 성격이 바뀐다 — 신뢰 시점이 매 설치에서 1회 검토로 축소된다.

## Decision Outcome

**옵션 2(CDN 패치본 채택)를 벤더링 방식으로 승인한다. 0003의 옵션 1(리스크 수용) 결정을 대체한다.**

- `vendor/xlsx-0.20.3.tgz` 를 레포에 커밋한다.
- `package.json` `"xlsx"` 를 `"file:vendor/xlsx-0.20.3.tgz"` 로 지정한다.
- 카드사 파서(`src/services/cardExcelImport.js`)는 **변경하지 않는다** — API 동일, 필드 단위 회귀 0건 실측 확인.
- `.npmrc` 는 추가하지 않는다 — 벤더링은 `allow-remote` 완화가 불필요하다.

### 잔존 리스크

- 취약점 자체는 해소되나, **차기 SheetJS 패치가 나와도 자동 반영되지 않는다.** `vendor/` 파일 교체는 수동 작업이며, 이 트레이드오프는 0003이 서술한 "신뢰 사설망 로컬 앱, RCE 아님, 단일 사용자 영향"이라는 기존 리스크 프로파일 위에서 감수 가능하다고 판단한다.
- vendor tarball은 바이너리이므로 diff 리뷰가 불가능하다. 교체 시점마다 SheetJS 공식 릴리스 노트 및 (가능하면) 배포 무결성 정보를 확인한다.

### 후속 조치

- Dependabot 취약점 알림 2건은 이 변경 반영(0.20.3) 후 재스캔되면 자동 해소된다.
- 향후 SheetJS가 npm 배포를 재개하면(현재는 재확인 결과 미발생) `vendor/` 벤더링을 걷어내고 통상적인 semver 의존성으로 되돌리는 것을 우선 검토한다.
- `vendor/xlsx-*.tgz` 업그레이드 시 이 ADR을 갱신하거나, 사소한 패치 버전업이면 이슈 코멘트로 갱신 이력만 남긴다.
- **`file:` 의존성은 `npm audit`/Dependabot의 어드바이저리 매칭 대상이 아니다**(독립 감사 2026-07, A7) — 이 패키지에 대해서만은 자동 스캔이 "취약점 없음"을 보장하지 않는다. Dependabot이 이 저장소의 다른(semver) 의존성 취약점을 감지해 PR을 열 때마다, 그 김에 SheetJS CDN(`cdn.sheetjs.com`)의 최신 배포 여부도 수동으로 함께 확인한다 — 별도 주기를 새로 만들지 않고 기존 Dependabot 알림에 편승시킨다.

## 위임 방법론 부기

이 ADR의 근거 조사(사용처 실태 조사, 대체 라이브러리 비교, 실증 하네스)는 로컬 LLM(opencode + Ollama)에 위임해 진행했고, Claude가 오케스트레이션·검증·최종 실행을 맡았다. 위임 과정에서 검증되지 않은 산출물(예: "ExcelJS가 BIFF8도 읽는다"는 잘못된 판단, 설치 실패 상태에서 조작된 "동등성 통과" 결과)이 발견되어 전량 재검증·재실행했다. 이 ADR에 실린 모든 수치는 Claude가 직접 실행해 재확인한 결과다. 상세 트러블슈팅·타임라인은 `.delegation-metrics/xlsx-112/DELEGATION_LOG.md` 참조(레포 외부, 비공개 기록).
