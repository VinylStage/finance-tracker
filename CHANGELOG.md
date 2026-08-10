# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0](https://github.com/VinylStage/finance-tracker/compare/v0.9.0...v0.10.0) (2026-08-10)


### Features

* **#274:** 카드 혜택과 청구 주기 ([#354](https://github.com/VinylStage/finance-tracker/issues/354)) ([cb2cc51](https://github.com/VinylStage/finance-tracker/commit/cb2cc513ec47e9422b881a07c19be961da1bf601)), closes [#274](https://github.com/VinylStage/finance-tracker/issues/274)
* **#280:** 거래를 반복 규칙으로 복사 + 규칙 편집 화면 ([#353](https://github.com/VinylStage/finance-tracker/issues/353)) ([004d8f4](https://github.com/VinylStage/finance-tracker/commit/004d8f45f91f9db8762a92f967f880ff8c14af50)), closes [#280](https://github.com/VinylStage/finance-tracker/issues/280)
* **#301:** 실행취소 스낵바와 변경 이력 화면 ([#352](https://github.com/VinylStage/finance-tracker/issues/352)) ([1bbd86a](https://github.com/VinylStage/finance-tracker/commit/1bbd86ab8b28b3a4a70fa413eaa6754013224f04)), closes [#301](https://github.com/VinylStage/finance-tracker/issues/301)
* 0.10.0 릴리즈 — M9~M14 기능과 클라이언트 테스트 정비 ([#522](https://github.com/VinylStage/finance-tracker/issues/522)) ([61e18f1](https://github.com/VinylStage/finance-tracker/commit/61e18f15a01c981b6fbedd49f93d92f98d5752a9))
* 1단계 실행취소 — 최근 작업 그룹 역적용 ([#300](https://github.com/VinylStage/finance-tracker/issues/300)) ([#341](https://github.com/VinylStage/finance-tracker/issues/341)) ([1246cc1](https://github.com/VinylStage/finance-tracker/commit/1246cc1b0f46ed5bb032c139fae19aca212a9696))
* **db:** audit_log 테이블과 작업 그룹(action_id) — 마이그레이션 010 ([#297](https://github.com/VinylStage/finance-tracker/issues/297)) ([#322](https://github.com/VinylStage/finance-tracker/issues/322)) ([0945bb1](https://github.com/VinylStage/finance-tracker/commit/0945bb170698c9cbb6e8948ee2a2d9f984eb957e))
* **db:** 거래 출처(origin) 구분 — 파생 거래를 스키마로 식별한다 ([#268](https://github.com/VinylStage/finance-tracker/issues/268)) ([#294](https://github.com/VinylStage/finance-tracker/issues/294)) ([5e51a6a](https://github.com/VinylStage/finance-tracker/commit/5e51a6ac2f8c3ec603a593a0e48925d434cf7c07))
* **db:** 결제 방식 3분류와 현금흐름 시점 분리 — 021 ([#289](https://github.com/VinylStage/finance-tracker/issues/289)) ([#368](https://github.com/VinylStage/finance-tracker/issues/368)) ([9266866](https://github.com/VinylStage/finance-tracker/commit/92668663e00adac49ff3c10a7a16543a4718ac48))
* **db:** 결제수단 분류 체계 — 카드사·카드상품과 신용/체크 ([#306](https://github.com/VinylStage/finance-tracker/issues/306)) ([#335](https://github.com/VinylStage/finance-tracker/issues/335)) ([afa047a](https://github.com/VinylStage/finance-tracker/commit/afa047a181d588aa4a1715fecf2652d6f7775338))
* **db:** 계좌(통장) 엔티티와 잔액 계산 ([#288](https://github.com/VinylStage/finance-tracker/issues/288)) ([#340](https://github.com/VinylStage/finance-tracker/issues/340)) ([caaa703](https://github.com/VinylStage/finance-tracker/commit/caaa703486738881aafc6e97566f17139853c55f))
* **db:** 대출 유형 마스터와 금리 이력 ([#285](https://github.com/VinylStage/finance-tracker/issues/285)) ([#326](https://github.com/VinylStage/finance-tracker/issues/326)) ([14102bf](https://github.com/VinylStage/finance-tracker/commit/14102bfee012a10f92fff7bf61266f04422c5d6a))
* **db:** 반복 규칙을 일·월·연 주기와 적용 기간으로 확장 ([#278](https://github.com/VinylStage/finance-tracker/issues/278)) ([#324](https://github.com/VinylStage/finance-tracker/issues/324)) ([de5c634](https://github.com/VinylStage/finance-tracker/commit/de5c634667e78f48b1d32a5d3a2f835c7ef6dd98))
* **db:** 카드사 할부 정책 마스터 테이블 신설 ([#266](https://github.com/VinylStage/finance-tracker/issues/266)) ([#292](https://github.com/VinylStage/finance-tracker/issues/292)) ([5f73616](https://github.com/VinylStage/finance-tracker/commit/5f73616cc5e430142217dc62deaed78c7369cf15))
* **db:** 할부 정책에 가맹점 카테고리 차원 — 기본 정책 + 카테고리 예외 ([#315](https://github.com/VinylStage/finance-tracker/issues/315)) ([#333](https://github.com/VinylStage/finance-tracker/issues/333)) ([a41782e](https://github.com/VinylStage/finance-tracker/commit/a41782e65936756f7322e32bf40ff6511e000441))
* **db:** 할부에 가맹점 카테고리 — 카테고리별 정책이 실제로 적용된다 ([#316](https://github.com/VinylStage/finance-tracker/issues/316)) ([#358](https://github.com/VinylStage/finance-tracker/issues/358)) ([113b88d](https://github.com/VinylStage/finance-tracker/commit/113b88da8bfdf41b5ca4feb2c7e72d6fff0d5d21))
* **ui:** 감사로그 정리 결과를 화면에 알린다 ([#445](https://github.com/VinylStage/finance-tracker/issues/445) §1) ([#447](https://github.com/VinylStage/finance-tracker/issues/447)) ([b65ad47](https://github.com/VinylStage/finance-tracker/commit/b65ad47f295462dba09e3dd1fc052da74842bfe7))
* **ui:** 거래 입력 시점에 어느 카드가 나은지 보여준다 ([#437](https://github.com/VinylStage/finance-tracker/issues/437)) ([#438](https://github.com/VinylStage/finance-tracker/issues/438)) ([d7f3bb8](https://github.com/VinylStage/finance-tracker/commit/d7f3bb81975fea537f4b00503b662ea1843e6d77))
* **ui:** 거래 입력에서 카드 상품을 고른다 ([#302](https://github.com/VinylStage/finance-tracker/issues/302) 2단계) ([#399](https://github.com/VinylStage/finance-tracker/issues/399)) ([0d32325](https://github.com/VinylStage/finance-tracker/commit/0d323254cc0d188043a93fd895069961b3713ac8))
* **ui:** 거래내역 달력뷰 — 목록/달력 토글과 월 이동 ([#305](https://github.com/VinylStage/finance-tracker/issues/305)) ([#320](https://github.com/VinylStage/finance-tracker/issues/320)) ([27a1774](https://github.com/VinylStage/finance-tracker/commit/27a1774ec13344bdfb4980982074ddc201280699))
* **ui:** 기존 할부에 청구 내역을 만드는 동선 ([#269](https://github.com/VinylStage/finance-tracker/issues/269)) ([#332](https://github.com/VinylStage/finance-tracker/issues/332)) ([a12a68d](https://github.com/VinylStage/finance-tracker/commit/a12a68d4ba6a77120f1ef15018c1c8c3a58f6e0f))
* **ui:** 달력·목록 컨텍스트에서 거래 추가 — 보고 있던 날짜가 기본값 ([#304](https://github.com/VinylStage/finance-tracker/issues/304)) ([#349](https://github.com/VinylStage/finance-tracker/issues/349)) ([690c363](https://github.com/VinylStage/finance-tracker/commit/690c36341cc570a2cf578e9e0c8ce1fb3f00c766))
* **ui:** 대시보드에서 달을 고를 수 있게 한다 ([#484](https://github.com/VinylStage/finance-tracker/issues/484)) ([#495](https://github.com/VinylStage/finance-tracker/issues/495)) ([1269609](https://github.com/VinylStage/finance-tracker/commit/1269609eb035a25a2f678d62b5ecd12d6689e3a9))
* **ui:** 메뉴·화면 검색 (커맨드 팔레트) ([#281](https://github.com/VinylStage/finance-tracker/issues/281)) ([#386](https://github.com/VinylStage/finance-tracker/issues/386)) ([d65d9d7](https://github.com/VinylStage/finance-tracker/commit/d65d9d76a306e94871cba3fb736169f024a30dba))
* **ui:** 보유 카드 등록·관리 화면 ([#302](https://github.com/VinylStage/finance-tracker/issues/302) 1단계) ([#397](https://github.com/VinylStage/finance-tracker/issues/397)) ([1231d87](https://github.com/VinylStage/finance-tracker/commit/1231d872c4a3db7a5a1ce8d410083679d1a25187))
* **ui:** 실수로 완료 처리한 할부 되돌리기 ([#295](https://github.com/VinylStage/finance-tracker/issues/295)) ([#334](https://github.com/VinylStage/finance-tracker/issues/334)) ([87a8cb7](https://github.com/VinylStage/finance-tracker/commit/87a8cb7d368d7ad5350782116203f39af6cbdf1e))
* **ui:** 앞으로의 잔액을 계좌마다 그린다 ([#291](https://github.com/VinylStage/finance-tracker/issues/291)) ([#387](https://github.com/VinylStage/finance-tracker/issues/387)) ([3b431f8](https://github.com/VinylStage/finance-tracker/commit/3b431f8dd77dfb7aff97969eb0aae128e32be588))
* **ui:** 자금흐름 Sankey — 데스크톱, 모바일은 스택 바 유지 ([#241](https://github.com/VinylStage/finance-tracker/issues/241)) ([#380](https://github.com/VinylStage/finance-tracker/issues/380)) ([3b179fc](https://github.com/VinylStage/finance-tracker/commit/3b179fcf4b02e1f18e5537062ee8636ef27f78c8))
* **ui:** 잔액 추이 표시 계층 ([#291](https://github.com/VinylStage/finance-tracker/issues/291)) ([#384](https://github.com/VinylStage/finance-tracker/issues/384)) ([38608b2](https://github.com/VinylStage/finance-tracker/commit/38608b226014bb4a6cfad3f0f35efe0bee6aa62b))
* **ui:** 지나친 중복 후보를 보고 되돌릴 수 있게 한다 ([#445](https://github.com/VinylStage/finance-tracker/issues/445) §2) ([#450](https://github.com/VinylStage/finance-tracker/issues/450)) ([0a5ce25](https://github.com/VinylStage/finance-tracker/commit/0a5ce25be9e9e1adabe89c0ea4851c414783cdbd))
* **ui:** 카드 전략 화면 ([#277](https://github.com/VinylStage/finance-tracker/issues/277)) ([#400](https://github.com/VinylStage/finance-tracker/issues/400)) ([848010e](https://github.com/VinylStage/finance-tracker/commit/848010e26a8d513c20b556f8ff19657428771270))
* **ui:** 카드 혜택을 입력할 화면을 넣는다 ([#435](https://github.com/VinylStage/finance-tracker/issues/435)) ([#436](https://github.com/VinylStage/finance-tracker/issues/436)) ([46e1f36](https://github.com/VinylStage/finance-tracker/commit/46e1f36be796f3975d64ce64e33933ee3fa07255))
* **ui:** 카드를 지우는 대신 더 안 쓰기로 바꾼다 ([#410](https://github.com/VinylStage/finance-tracker/issues/410)) ([#412](https://github.com/VinylStage/finance-tracker/issues/412)) ([c4a42eb](https://github.com/VinylStage/finance-tracker/commit/c4a42eb2195c4bffe74acafe4de957d50b6b06fb))
* **ui:** 카드사 할부 정책 입력 화면 ([#271](https://github.com/VinylStage/finance-tracker/issues/271)) ([#312](https://github.com/VinylStage/finance-tracker/issues/312)) ([3a6af1f](https://github.com/VinylStage/finance-tracker/commit/3a6af1f088b48cd44486bbdd56b0c62170ed457b))
* **ui:** 통장 잔액 화면 ([#291](https://github.com/VinylStage/finance-tracker/issues/291) 1차) ([#381](https://github.com/VinylStage/finance-tracker/issues/381)) ([762e5cc](https://github.com/VinylStage/finance-tracker/commit/762e5cc371e90151c5f5ee40673c76ed4a505ab0))
* **ui:** 파생 거래 구분 표시와 부채관리 화면 편집 동선 ([#270](https://github.com/VinylStage/finance-tracker/issues/270)) ([#314](https://github.com/VinylStage/finance-tracker/issues/314)) ([4625894](https://github.com/VinylStage/finance-tracker/commit/462589497232119b50fabf13181e4ecb115fafd5))
* **ui:** 할부 개월수를 정책이 허용하는 값으로 제한한다 ([#317](https://github.com/VinylStage/finance-tracker/issues/317)) ([#362](https://github.com/VinylStage/finance-tracker/issues/362)) ([24a38bb](https://github.com/VinylStage/finance-tracker/commit/24a38bb4aa1cba65cdd54a080c7392ec51d338ab))
* **ui:** 할부 청구 시작월을 구매일·카드 청구주기에서 계산한다 ([#364](https://github.com/VinylStage/finance-tracker/issues/364)) ([#374](https://github.com/VinylStage/finance-tracker/issues/374)) ([ef860a4](https://github.com/VinylStage/finance-tracker/commit/ef860a42255b2705c0d892e8550b729eb5d658ed))
* **ui:** 흐름 분석 히트맵 연·월 지정 ([#273](https://github.com/VinylStage/finance-tracker/issues/273)) ([#345](https://github.com/VinylStage/finance-tracker/issues/345)) ([8aff25d](https://github.com/VinylStage/finance-tracker/commit/8aff25d78fa31e1d7e0a39f7925493f8c9dff30b))
* 감사로그 보존 정책 — 180일, 되돌릴 수 있는 것은 남긴다 ([#367](https://github.com/VinylStage/finance-tracker/issues/367)) ([#375](https://github.com/VinylStage/finance-tracker/issues/375)) ([db87b0d](https://github.com/VinylStage/finance-tracker/commit/db87b0d6dcfb9d36754409185de979bf14a4927e))
* 결제 방식 일괄 재분류 도구 ([#289](https://github.com/VinylStage/finance-tracker/issues/289)) ([#419](https://github.com/VinylStage/finance-tracker/issues/419)) ([8f36897](https://github.com/VinylStage/finance-tracker/commit/8f368972f84eec5dc7db1a770901abd53242d631))
* 구매일에서 청구월을 계산하는 billingMonthFor ([#290](https://github.com/VinylStage/finance-tracker/issues/290)) ([#361](https://github.com/VinylStage/finance-tracker/issues/361)) ([167d746](https://github.com/VinylStage/finance-tracker/commit/167d74687ae56a1049466a08972e699e1dca4e34))
* 기존 거래의 청구월을 소급해 채운다 ([#289](https://github.com/VinylStage/finance-tracker/issues/289)) ([#425](https://github.com/VinylStage/finance-tracker/issues/425)) ([227602e](https://github.com/VinylStage/finance-tracker/commit/227602e0d433fab38e6f97e395a3b74b7d238990))
* 마이너스통장 복리 이자 계산 ([#286](https://github.com/VinylStage/finance-tracker/issues/286)) ([#327](https://github.com/VinylStage/finance-tracker/issues/327)) ([b3bc81d](https://github.com/VinylStage/finance-tracker/commit/b3bc81db420c3dfdd9905acf9736f3c6368d3e3b))
* 부분상환 입력·히스토리와 거래내역 반영 ([#287](https://github.com/VinylStage/finance-tracker/issues/287)) ([#328](https://github.com/VinylStage/finance-tracker/issues/328)) ([e0edd4c](https://github.com/VinylStage/finance-tracker/commit/e0edd4c40fb36e73cbfb444bf2453aaaf127220f))
* 서버 기동 시 반복거래 catch-up 자동 생성 ([#279](https://github.com/VinylStage/finance-tracker/issues/279)) ([#330](https://github.com/VinylStage/finance-tracker/issues/330)) ([3824352](https://github.com/VinylStage/finance-tracker/commit/38243521785836a2204683c47271d18de9a6b241))
* 신용카드 거래에 청구월을 붙인다 ([#289](https://github.com/VinylStage/finance-tracker/issues/289) A안) ([#415](https://github.com/VinylStage/finance-tracker/issues/415)) ([e4f8fed](https://github.com/VinylStage/finance-tracker/commit/e4f8fedfaf3602eb845f11df844ea686b293e4c1))
* 작업 컨텍스트 — actor/action_id 주입과 시스템 경로 표시 ([#298](https://github.com/VinylStage/finance-tracker/issues/298)) ([#323](https://github.com/VinylStage/finance-tracker/issues/323)) ([67c7ee7](https://github.com/VinylStage/finance-tracker/commit/67c7ee7088971f1230e7e266a1c212387e8fa7c1))
* 잔액 계산이 현금흐름 시점을 이해한다 ([#289](https://github.com/VinylStage/finance-tracker/issues/289) → [#291](https://github.com/VinylStage/finance-tracker/issues/291) 선행) ([#372](https://github.com/VinylStage/finance-tracker/issues/372)) ([ae25a04](https://github.com/VinylStage/finance-tracker/commit/ae25a04c4408822b45fc2c5fd32a239975c24a5c))
* 잔액 라우트가 현금흐름 시점을 읽는다 ([#291](https://github.com/VinylStage/finance-tracker/issues/291) 선행) ([#377](https://github.com/VinylStage/finance-tracker/issues/377)) ([781f2ea](https://github.com/VinylStage/finance-tracker/commit/781f2eafc71cd9c73e89c37e07316ed773e20f54))
* 전 테이블 쓰기 감사 캡처 — 트리거 + 컨텍스트 테이블 ([#299](https://github.com/VinylStage/finance-tracker/issues/299)) ([#336](https://github.com/VinylStage/finance-tracker/issues/336)) ([9d65ede](https://github.com/VinylStage/finance-tracker/commit/9d65edefc3b9f7f857856bcce2c7d7a2e606c4ef))
* 전역 기간 필터 — 조회 기간을 한 곳에서 정한다 ([#272](https://github.com/VinylStage/finance-tracker/issues/272)) ([#403](https://github.com/VinylStage/finance-tracker/issues/403)) ([a76adbf](https://github.com/VinylStage/finance-tracker/commit/a76adbf76c88193589321ea6d67fc9b1ee155e05))
* 전월 실적을 달력월로 합산하고 카드 전략을 배선한다 ([#276](https://github.com/VinylStage/finance-tracker/issues/276)) ([#398](https://github.com/VinylStage/finance-tracker/issues/398)) ([038ee6e](https://github.com/VinylStage/finance-tracker/commit/038ee6e062108587320bb6a95c56c606269eef75))
* 조회 기간 파라미터를 from/to 로 정규화하는 공통 파서 ([#272](https://github.com/VinylStage/finance-tracker/issues/272)) ([#338](https://github.com/VinylStage/finance-tracker/issues/338)) ([d62588a](https://github.com/VinylStage/finance-tracker/commit/d62588ad2033debdc2ce97c02e34fa282242be98))
* 지난 거래를 카드 상품에 붙이는 재매핑 도구 ([#302](https://github.com/VinylStage/finance-tracker/issues/302) 3단계) ([#401](https://github.com/VinylStage/finance-tracker/issues/401)) ([957bd0c](https://github.com/VinylStage/finance-tracker/commit/957bd0c7ba77b859ea4f6b2f4a91c6cb39616b06))
* 청구액 미리보기에도 카테고리 정책을 반영한다 ([#316](https://github.com/VinylStage/finance-tracker/issues/316)) ([#359](https://github.com/VinylStage/finance-tracker/issues/359)) ([62be9fc](https://github.com/VinylStage/finance-tracker/commit/62be9fc07faf547e5c1bc1f8cbd7c24cff403abe))
* 총 결제금액과 정책으로 월별 청구액을 자동 계산한다 ([#316](https://github.com/VinylStage/finance-tracker/issues/316)) ([#351](https://github.com/VinylStage/finance-tracker/issues/351)) ([1589593](https://github.com/VinylStage/finance-tracker/commit/15895934721409d59243fc03eaf07a60d5b81245))
* 카드 전략 화면이 더 안 쓰는 카드를 흐리게 보여준다 ([#410](https://github.com/VinylStage/finance-tracker/issues/410)) ([#413](https://github.com/VinylStage/finance-tracker/issues/413)) ([55bd1aa](https://github.com/VinylStage/finance-tracker/commit/55bd1aac5fc6e2638dd28d7afd567690601d8ee5))
* 카드 혜택 추정과 사후 비교 ([#276](https://github.com/VinylStage/finance-tracker/issues/276)) ([#396](https://github.com/VinylStage/finance-tracker/issues/396)) ([07ef9a2](https://github.com/VinylStage/finance-tracker/commit/07ef9a2ebccab7cffdc2b50996c5428230011181))
* 카카오 로컬 API 로 가맹점을 분류한다 ([#275](https://github.com/VinylStage/finance-tracker/issues/275)) ([#390](https://github.com/VinylStage/finance-tracker/issues/390)) ([fc59ed5](https://github.com/VinylStage/finance-tracker/commit/fc59ed518b5e59cca32aa53f1f996fff40aa4b81))
* 할부 이자 계산 엔진 — 월별 이자·원금 분해 ([#267](https://github.com/VinylStage/finance-tracker/issues/267)) ([#293](https://github.com/VinylStage/finance-tracker/issues/293)) ([087df52](https://github.com/VinylStage/finance-tracker/commit/087df52d7034d41346238ae880f6db338e55620e))
* 할부 전환으로 생긴 중복 거래 탐지 ([#269](https://github.com/VinylStage/finance-tracker/issues/269)) ([#331](https://github.com/VinylStage/finance-tracker/issues/331)) ([edc0389](https://github.com/VinylStage/finance-tracker/commit/edc0389e1a3296df9bcea3b4be637084a1f3b469))
* 할부·리볼빙·부채이자를 거래내역에 자동 생성 ([#269](https://github.com/VinylStage/finance-tracker/issues/269)) ([#311](https://github.com/VinylStage/finance-tracker/issues/311)) ([af6f3b9](https://github.com/VinylStage/finance-tracker/commit/af6f3b9fe39b68d8586aa85391229e89af957d3b))


### Bug Fixes

* **api:** 거래 전체 삭제에 확인 토큰을 요구한다 ([#363](https://github.com/VinylStage/finance-tracker/issues/363)) ([#365](https://github.com/VinylStage/finance-tracker/issues/365)) ([9338610](https://github.com/VinylStage/finance-tracker/commit/9338610ec1ae6c962fcec07fc8ddd67a4c4fdea7))
* **api:** 결제수단을 계좌에 잇는 경로 ([#376](https://github.com/VinylStage/finance-tracker/issues/376)) ([#378](https://github.com/VinylStage/finance-tracker/issues/378)) ([0987458](https://github.com/VinylStage/finance-tracker/commit/0987458bdd3033dce6e37cc77599b97e38f554b8))
* client/node_modules 를 인덱스에서 빼고 심링크까지 무시한다 ([#347](https://github.com/VinylStage/finance-tracker/issues/347)) ([#348](https://github.com/VinylStage/finance-tracker/issues/348)) ([61c3599](https://github.com/VinylStage/finance-tracker/commit/61c35991ca7241c35857dc9f66a82f853c0faeb9))
* **db:** 감사 트리거가 빠지면 기동 때 되살린다 ([#454](https://github.com/VinylStage/finance-tracker/issues/454)) ([#456](https://github.com/VinylStage/finance-tracker/issues/456)) ([a83b8f9](https://github.com/VinylStage/finance-tracker/commit/a83b8f946dc49809c2cc17f27f1c1bcb91c8c421))
* **deps:** postcss 를 8.5.25 로 올려 sourceMappingURL 임의 파일 읽기를 막는다 ([#440](https://github.com/VinylStage/finance-tracker/issues/440)) ([8c869a9](https://github.com/VinylStage/finance-tracker/commit/8c869a90dba53a215a3bd6efad580330a5dfc75b))
* **export:** CSV 값에 CR 단독이 있으면 감싸지 않던 것 수정 ([#458](https://github.com/VinylStage/finance-tracker/issues/458)) ([07a16a2](https://github.com/VinylStage/finance-tracker/commit/07a16a2c99f5b9ad388dce8a5ac8436e0144ba89))
* **security:** id 목록 강제변환으로 고른 적 없는 거래가 지워졌다 ([#465](https://github.com/VinylStage/finance-tracker/issues/465)) ([1966b2e](https://github.com/VinylStage/finance-tracker/commit/1966b2e228371c4cd06402643b6d1383ebaf584b))
* **settings:** 재활성화가 부분 전송이라 한 번도 성공한 적이 없다 ([#482](https://github.com/VinylStage/finance-tracker/issues/482)) ([a5969ea](https://github.com/VinylStage/finance-tracker/commit/a5969ea99204ae1a494c9c928a34d8fcbc28606b))
* **ui:** 수정 폼이 대상을 바꿔도 이전 값이 남아 엉뚱한 레코드를 덮는다 ([#478](https://github.com/VinylStage/finance-tracker/issues/478)) ([935e088](https://github.com/VinylStage/finance-tracker/commit/935e08803cc30e27d499f2d9d9073ab09f3344ab))
* **ui:** 카드 삭제가 동작하지 않던 것을 고친다 ([#302](https://github.com/VinylStage/finance-tracker/issues/302)) ([#402](https://github.com/VinylStage/finance-tracker/issues/402)) ([0a5c098](https://github.com/VinylStage/finance-tracker/commit/0a5c0987ec4313e1c65d5bdd5ec4a5cc0ddeb56c))
* **ui:** 카테고리 드롭다운에 아이콘 키가 라벨로 노출되던 문제 ([#283](https://github.com/VinylStage/finance-tracker/issues/283)) ([8881ece](https://github.com/VinylStage/finance-tracker/commit/8881ece49ba206c0bcd60d9322f2b8b9dd684956))
* **ui:** 파이 차트가 조각을 그리지 않던 문제 ([#237](https://github.com/VinylStage/finance-tracker/issues/237)) ([#342](https://github.com/VinylStage/finance-tracker/issues/342)) ([cc11287](https://github.com/VinylStage/finance-tracker/commit/cc112877fbaaa9b95bf8f8bf1204c2f9bc81116d))
* 부분무이자 면제 방향을 카드사 표기에 맞춘다 ([#267](https://github.com/VinylStage/finance-tracker/issues/267)) ([#318](https://github.com/VinylStage/finance-tracker/issues/318)) ([14f3e13](https://github.com/VinylStage/finance-tracker/commit/14f3e133d1e1313921f87102e91e989e730e8273))
* 잔액을 오늘까지로 자르고 미래는 추이로 분리한다 ([#382](https://github.com/VinylStage/finance-tracker/issues/382), [#291](https://github.com/VinylStage/finance-tracker/issues/291)) ([#383](https://github.com/VinylStage/finance-tracker/issues/383)) ([ff6c4f4](https://github.com/VinylStage/finance-tracker/commit/ff6c4f43e8b3f386f8b956f2e34c2263704f93d5))
* 재매핑이 청구월을 따라 고치게 한다 ([#421](https://github.com/VinylStage/finance-tracker/issues/421)) ([#422](https://github.com/VinylStage/finance-tracker/issues/422)) ([a2c08c2](https://github.com/VinylStage/finance-tracker/commit/a2c08c253336350dd83b8343da47da3ba1e0c4f5))
* 재분류가 청구월을 따라 고치게 한다 ([#289](https://github.com/VinylStage/finance-tracker/issues/289)) ([#428](https://github.com/VinylStage/finance-tracker/issues/428)) ([16ff35d](https://github.com/VinylStage/finance-tracker/commit/16ff35d7d6ce73b79ef8509d796830b2380a3e7f))
* 카드 삭제를 비활성화로 바꾼다 ([#410](https://github.com/VinylStage/finance-tracker/issues/410)) ([#411](https://github.com/VinylStage/finance-tracker/issues/411)) ([5a6f56e](https://github.com/VinylStage/finance-tracker/commit/5a6f56e488f611529401d1418f4143d787c9fd46))
* 카드 엑셀의 콤마 붙은 금액을 읽게 하고 파서를 합성 픽스처로 잠근다 ([#432](https://github.com/VinylStage/finance-tracker/issues/432)) ([2af77fa](https://github.com/VinylStage/finance-tracker/commit/2af77fa1b042ee873ef6922a15b357f82f58b05b))
* 파생 거래 포함 토글이 실제로 집계를 바꾸게 한다 ([#272](https://github.com/VinylStage/finance-tracker/issues/272)) ([#414](https://github.com/VinylStage/finance-tracker/issues/414)) ([2880d9f](https://github.com/VinylStage/finance-tracker/commit/2880d9fe04374acc038060ac7e49a6534db987b7))
* 할부 끝수를 첫 회차 원금에 얹는다 ([#343](https://github.com/VinylStage/finance-tracker/issues/343)) ([#344](https://github.com/VinylStage/finance-tracker/issues/344)) ([dd25109](https://github.com/VinylStage/finance-tracker/commit/dd251093d21a547ed092612957ec01fcb42e97db))


### Maintenance

* **client:** vite 프록시 대상을 환경변수로 열어 세션별 격리를 가능하게 한다 ([#325](https://github.com/VinylStage/finance-tracker/issues/325)) ([91c6f01](https://github.com/VinylStage/finance-tracker/commit/91c6f01bb7573e0e472c0fe6f483f74696de3ef4))
* **delegate:** 클라이언트 위임 러너와 돌연변이 도구를 저장소로 옮긴다 ([#475](https://github.com/VinylStage/finance-tracker/issues/475)) ([5219b93](https://github.com/VinylStage/finance-tracker/commit/5219b93c9bb1eab4994f6fd683d082e8ac1c9202))
* **deps:** brace-expansion 5.0.9 로 올려 감사 게이트를 통과시킨다 ([#339](https://github.com/VinylStage/finance-tracker/issues/339)) ([6dc7635](https://github.com/VinylStage/finance-tracker/commit/6dc763583a8a4692c603effd946ee2dcc7224d7a))
* **deps:** nanoid 를 3.3.18 로 올린다 — CI audit 이 릴리즈를 막고 있다 ([#521](https://github.com/VinylStage/finance-tracker/issues/521)) ([6663597](https://github.com/VinylStage/finance-tracker/commit/6663597f13f5c402602811f60808d3e5286da380))
* ROADMAP 를 걷어내고 아키텍처 목록을 코드에서 생성한다 ([#443](https://github.com/VinylStage/finance-tracker/issues/443)) ([c60476b](https://github.com/VinylStage/finance-tracker/commit/c60476bf3c90df965d9bccebb55a44564a1cc434))
* **test:** 마이그레이션 체계 이전 스키마를 픽스처로 보존한다 ([#369](https://github.com/VinylStage/finance-tracker/issues/369)) ([#370](https://github.com/VinylStage/finance-tracker/issues/370)) ([a2bf70a](https://github.com/VinylStage/finance-tracker/commit/a2bf70a04890c8fe018579a5e625dc9377855f14))
* 공수 기록을 저장소에서 뺀다 — 공개 저장소에 올릴 것이 아니었다 ([2d27a5a](https://github.com/VinylStage/finance-tracker/commit/2d27a5a770f5d13b3d49c102638f8f9874880b7e))
* 기능 이슈·PR 템플릿에 사용자 가이드 갱신을 넣는다 ([#501](https://github.com/VinylStage/finance-tracker/issues/501)) ([4dd9f9f](https://github.com/VinylStage/finance-tracker/commit/4dd9f9fc7f3ca22dbf7271a2878e001cb6c61b76))
* 릴리즈 아티팩트를 main 과 맞추고 어긋남을 CI 가 막게 한다 ([#441](https://github.com/VinylStage/finance-tracker/issues/441)) ([328d67b](https://github.com/VinylStage/finance-tracker/commit/328d67b9b12870769868b23eaf5f91b026811f1b))
* 스테이징 이상 감지 훅 — 심링크·대용량 파일을 커밋 전에 막는다 ([#347](https://github.com/VinylStage/finance-tracker/issues/347) 후속) ([#350](https://github.com/VinylStage/finance-tracker/issues/350)) ([6d7912e](https://github.com/VinylStage/finance-tracker/commit/6d7912ed4e9d8f63a83d77f789e331f24975b268))
* 저장소 작업 규칙 CLAUDE.md 신설 — 세션 첫 스텝 DB 백업 표준화 ([#308](https://github.com/VinylStage/finance-tracker/issues/308)) ([93f764e](https://github.com/VinylStage/finance-tracker/commit/93f764e7f69bced9b2d710afccff7bd1a38431b6))


### Documentation

* **adr:** 0009 할부수수료는 잔액 기준 월할로 계산한다 ([#284](https://github.com/VinylStage/finance-tracker/issues/284)) ([#321](https://github.com/VinylStage/finance-tracker/issues/321)) ([b24801c](https://github.com/VinylStage/finance-tracker/commit/b24801ce3c63c9672e661a0196240bfdfa0351f7))
* **adr:** 데이터 변경 전 프리뷰·확인을 사이클 공통 원칙으로 승격 ([#307](https://github.com/VinylStage/finance-tracker/issues/307)) ([#309](https://github.com/VinylStage/finance-tracker/issues/309)) ([b56ae0f](https://github.com/VinylStage/finance-tracker/commit/b56ae0fcc9b136f0cfcbfbbae40b06e2647c3fda))
* **audit:** 구현 감사를 판정 문서로 다시 쓴다 ([#444](https://github.com/VinylStage/finance-tracker/issues/444)) ([a796436](https://github.com/VinylStage/finance-tracker/commit/a7964364e2fa1060d493ec6d5b2dc07247ccb797))
* M6~M11 에서 늘어난 스키마와 API 를 문서에 반영 ([#355](https://github.com/VinylStage/finance-tracker/issues/355)) ([2716f43](https://github.com/VinylStage/finance-tracker/commit/2716f43f82edf3737c130e4215e39556f87dc61a))
* M7~M13 계열 세션 인계 문서 (2026-08-05) ([#420](https://github.com/VinylStage/finance-tracker/issues/420)) ([1790e89](https://github.com/VinylStage/finance-tracker/commit/1790e893932f19cbeaa98e944436aa9c5d1c7aeb))
* 감사로그 캡처 방식 ADR 0007 ([#296](https://github.com/VinylStage/finance-tracker/issues/296)) ([#366](https://github.com/VinylStage/finance-tracker/issues/366)) ([0f042d8](https://github.com/VinylStage/finance-tracker/commit/0f042d8cd67f5c59e1d2542218ca8e18ae72e23b))
* 백로그를 이슈에서 파일로 옮긴다 — [#442](https://github.com/VinylStage/finance-tracker/issues/442) 가 착수 전에 닫혔다 ([#502](https://github.com/VinylStage/finance-tracker/issues/502)) ([c8aba83](https://github.com/VinylStage/finance-tracker/commit/c8aba833dc88f98678794d2338a4c2cc193003bc))
* 전월실적 산정기간을 달력월로 바로잡는다 ([#423](https://github.com/VinylStage/finance-tracker/issues/423)) ([55e2bdb](https://github.com/VinylStage/finance-tracker/commit/55e2bdb3cde8fce7ca9be5fe554e6d66b5bdc263))
* 할부수수료 계산 기준을 월할로 확정하고 공시값으로 고정한다 ([#284](https://github.com/VinylStage/finance-tracker/issues/284)) ([#319](https://github.com/VinylStage/finance-tracker/issues/319)) ([c16e768](https://github.com/VinylStage/finance-tracker/commit/c16e7680be8ae026307a43994bda9393326adc34))


### Tests

* accountsRoute 서버 기동을 공용 헬퍼로 이관한다 ([#379](https://github.com/VinylStage/finance-tracker/issues/379)) ([#404](https://github.com/VinylStage/finance-tracker/issues/404)) ([6595208](https://github.com/VinylStage/finance-tracker/commit/6595208643e81522e5792fd246d01586bc35315f))
* **app:** 라우팅 껍데기 — 어느 주소가 어느 화면으로 가는가 ([#515](https://github.com/VinylStage/finance-tracker/issues/515)) ([9c0b700](https://github.com/VinylStage/finance-tracker/commit/9c0b7000087f54f30905df4f35a4726f5a98ace6))
* card-import 프리뷰가 DB 를 바꾸지 않는 것을 고정한다 ([#307](https://github.com/VinylStage/finance-tracker/issues/307)) ([#357](https://github.com/VinylStage/finance-tracker/issues/357)) ([fb037cb](https://github.com/VinylStage/finance-tracker/commit/fb037cb575e2287759d8cb4460691b9a17617609))
* **client:** categoryChart 테스트 신설 — 테스트가 하나도 없던 모듈 ([#459](https://github.com/VinylStage/finance-tracker/issues/459)) ([3e8e5da](https://github.com/VinylStage/finance-tracker/commit/3e8e5da67cff86fd93132a3315c402277feb00a2))
* **client:** fetch 래퍼와 백업표시 — 모든 요청이 지나는 통로가 0% 였다 ([#471](https://github.com/VinylStage/finance-tracker/issues/471)) ([5ea7205](https://github.com/VinylStage/finance-tracker/commit/5ea72050a7453570dbd20f262a2743d681e26607))
* **client:** 거래내역 뷰 상태 — URL 과 세션 중 무엇이 이기는지 잠근다 ([#476](https://github.com/VinylStage/finance-tracker/issues/476)) ([1e2576f](https://github.com/VinylStage/finance-tracker/commit/1e2576f65ee55dcd9f646dd597ce8b6562a6f330))
* **client:** 대출 유형 표기·한도 사용률 모듈 테스트 신설 ([#469](https://github.com/VinylStage/finance-tracker/issues/469)) ([e0cf3f2](https://github.com/VinylStage/finance-tracker/commit/e0cf3f2029954cc32bdc82f4ad244c7f551d8dcc))
* **client:** 따라잡기 알림 — 자기가 안 만든 거래가 나타나는 걸 알리는 자리다 ([#481](https://github.com/VinylStage/finance-tracker/issues/481)) ([a1f860f](https://github.com/VinylStage/finance-tracker/commit/a1f860fe6ff4f073cb411532baa41bfd73f0cbf7))
* **client:** 리볼빙 원장 — 필터가 주소에 실리는지부터 잠근다 ([#479](https://github.com/VinylStage/finance-tracker/issues/479)) ([a8e6e2b](https://github.com/VinylStage/finance-tracker/commit/a8e6e2b9828e7b9ec35c37e395f99b45c06fe043))
* **client:** 모달 잠금·온보딩·빠른입력 — 저장 중 닫힘 방지가 무테스트였다 ([#470](https://github.com/VinylStage/finance-tracker/issues/470)) ([5223ac1](https://github.com/VinylStage/finance-tracker/commit/5223ac189ea5d55acf69cc275fd825098a74a86f))
* **client:** 부채·할부 페이지 — 커버리지가 아니라 규칙을 잡는다 ([#473](https://github.com/VinylStage/finance-tracker/issues/473)) ([f770c4c](https://github.com/VinylStage/finance-tracker/commit/f770c4ce779660217bc7da2c26f3280d10320290))
* **client:** 최초 실행 웰컴 — 게이트와 플로우 둘 다 0% 였다 ([#474](https://github.com/VinylStage/finance-tracker/issues/474)) ([a876857](https://github.com/VinylStage/finance-tracker/commit/a87685715a1bb2e236fd38c4668b941334f3f165))
* **client:** 크래시 경계·테마·대출유형 — 셋 다 사실상 무테스트였다 ([#468](https://github.com/VinylStage/finance-tracker/issues/468)) ([145b4b6](https://github.com/VinylStage/finance-tracker/commit/145b4b6c75be8fac5cca3ddf22c02fda94f700df))
* **client:** 해시 이동 훅과 연 히트맵 — 둘 다 조용히 틀리는 자리다 ([#477](https://github.com/VinylStage/finance-tracker/issues/477)) ([e416fbd](https://github.com/VinylStage/finance-tracker/commit/e416fbd7fe5866f7d140308d0aeae5e83df7e3f8))
* **csv:** 공백 줄과 한 칸만 빈 줄을 갈라 잠근다 ([#463](https://github.com/VinylStage/finance-tracker/issues/463)) ([#516](https://github.com/VinylStage/finance-tracker/issues/516)) ([7e2b312](https://github.com/VinylStage/finance-tracker/commit/7e2b3122796acd555e51b1f8ee2b7461a84c2a6e))
* **dashboard:** 반복 거래 확인과 섹션 접힘 — 691줄에 전용 테스트가 없었다 ([#512](https://github.com/VinylStage/finance-tracker/issues/512)) ([46c189c](https://github.com/VinylStage/finance-tracker/commit/46c189c64814451ce2c1090264818410804e3ff3))
* **dashboard:** 집계·기간 축 — 차트 바깥에서 확인할 수 있는 것만 잡는다 ([#514](https://github.com/VinylStage/finance-tracker/issues/514)) ([70b32ad](https://github.com/VinylStage/finance-tracker/commit/70b32ada1371d51ae4a1b9ec6e0dcf7696846ed7))
* **debts:** 이자·상환 이력 축 — 잔액을 직접 고치지 않는다는 규칙을 잠근다 ([#507](https://github.com/VinylStage/finance-tracker/issues/507)) ([9f9ef63](https://github.com/VinylStage/finance-tracker/commit/9f9ef63633eae41a7b4b45e72f25475b6ebeff87))
* **installments:** 등록 폼과 행 동작 — 청구 시작월이 어디서 오는지 잠근다 ([#506](https://github.com/VinylStage/finance-tracker/issues/506)) ([6567a25](https://github.com/VinylStage/finance-tracker/commit/6567a25f45a6014f7e6f19d70ef078bc4845c429))
* **revolving:** 거절 경로 8건 — PUT 의 중복 충돌이 안 잠겨 있었다 ([#462](https://github.com/VinylStage/finance-tracker/issues/462)) ([bb02e43](https://github.com/VinylStage/finance-tracker/commit/bb02e43740a5c158b28d5950b2e4798629d46897))
* **settings:** 내보내기·변경이력·데이터 위치 — 이동 전에 남기는 것을 잡는다 ([#505](https://github.com/VinylStage/finance-tracker/issues/505)) ([a5efa80](https://github.com/VinylStage/finance-tracker/commit/a5efa80e6a5f18561b18ade29a8f9e99b4110ea4))
* **settings:** 반복 거래 관리 — 주기에 따라 무엇을 묻고 무엇을 보내는가 ([#483](https://github.com/VinylStage/finance-tracker/issues/483)) ([f22acec](https://github.com/VinylStage/finance-tracker/commit/f22acec434cf9211ca7b9731248716098a29bdd7))
* **settings:** 백업·복원 두 절 — 확인 토큰이 붙는 곳과 안 붙는 곳 ([#486](https://github.com/VinylStage/finance-tracker/issues/486)) ([f146bf1](https://github.com/VinylStage/finance-tracker/commit/f146bf168c35be28b017f4e32a1f67bc0d72d766))
* **settings:** 위험 구역과 기본 설정 — 절 단위로 파일을 나눠 잠근다 ([#480](https://github.com/VinylStage/finance-tracker/issues/480)) ([f3f2ab1](https://github.com/VinylStage/finance-tracker/commit/f3f2ab18650636cb46430428d7fff5f53110e956))
* **settings:** 임포트 두 절 — 미리보기와 실행이 다른 주소로 가는가 ([#487](https://github.com/VinylStage/finance-tracker/issues/487)) ([a1e20d5](https://github.com/VinylStage/finance-tracker/commit/a1e20d5b6eac0b8356cccea33c696da23e1b3881))
* **transactions:** 기간비교 일·주·연 모드 — 셋 다 무테스트였다 ([#464](https://github.com/VinylStage/finance-tracker/issues/464)) ([c1a7351](https://github.com/VinylStage/finance-tracker/commit/c1a735138b4fc6c4712c5171f8b1fc42eda6da8d))
* **transactions:** 쓰기 축 — 되돌릴 수 없는 동작 앞에 무엇이 서 있는가 ([#509](https://github.com/VinylStage/finance-tracker/issues/509)) ([127251b](https://github.com/VinylStage/finance-tracker/commit/127251b2e8eec9064a4f67351b3d8ba3d348ea3f))
* 가이드 문서가 없을 때의 404 를 덮는다 ([#448](https://github.com/VinylStage/finance-tracker/issues/448)) ([#452](https://github.com/VinylStage/finance-tracker/issues/452)) ([286ff70](https://github.com/VinylStage/finance-tracker/commit/286ff7035c551124e68f98c8420f657bc2c8c373))
* 거래 입력 자동완성 두 엔드포인트를 덮는다 ([#457](https://github.com/VinylStage/finance-tracker/issues/457)) ([a70db0f](https://github.com/VinylStage/finance-tracker/commit/a70db0fe23e8de9bb408809309fe9955a7e7b96b))
* 라우트 테스트 17건을 공용 서버 헬퍼로 이관 ([#379](https://github.com/VinylStage/finance-tracker/issues/379), 12~19차) ([#439](https://github.com/VinylStage/finance-tracker/issues/439)) ([5a3a715](https://github.com/VinylStage/finance-tracker/commit/5a3a715b91823a44da44bb2c7c2e5f3bb2ee1a4a))
* 라우트 테스트 6건을 공용 서버 헬퍼로 이관 ([#379](https://github.com/VinylStage/finance-tracker/issues/379), 9~11차) ([#431](https://github.com/VinylStage/finance-tracker/issues/431)) ([858585b](https://github.com/VinylStage/finance-tracker/commit/858585bd75518dd0122f2115a71515fbbb72e1a4))
* 라우트 테스트 6건을 공용 서버 헬퍼로 이관 ([#379](https://github.com/VinylStage/finance-tracker/issues/379)) ([#430](https://github.com/VinylStage/finance-tracker/issues/430)) ([41af17c](https://github.com/VinylStage/finance-tracker/commit/41af17cd7cf445088295d3198f5950dfa7890128))
* 마이그레이션 소유 스키마를 테스트가 복제하지 않게 한다 (감사 S4) ([#409](https://github.com/VinylStage/finance-tracker/issues/409)) ([362b278](https://github.com/VinylStage/finance-tracker/commit/362b2787d355d0c5ebbce6b5cfe6d964fe4ff5aa))
* 부하로 플레이키를 재현하는 도구를 넣는다 ([#429](https://github.com/VinylStage/finance-tracker/issues/429)) ([#451](https://github.com/VinylStage/finance-tracker/issues/451)) ([a542e52](https://github.com/VinylStage/finance-tracker/commit/a542e52dba93501e7ce2d3c7b11463742cf33ac6))
* 서버 기동 boilerplate 2개 파일을 공용 헬퍼로 이관한다 ([#379](https://github.com/VinylStage/finance-tracker/issues/379) 3차 배치) ([#424](https://github.com/VinylStage/finance-tracker/issues/424)) ([49c471f](https://github.com/VinylStage/finance-tracker/commit/49c471f82659fadbf15d83af00e968af6289c36e))
* 서버 기동 boilerplate 2개 파일을 공용 헬퍼로 이관한다 ([#379](https://github.com/VinylStage/finance-tracker/issues/379) 4차 배치) ([#426](https://github.com/VinylStage/finance-tracker/issues/426)) ([939388b](https://github.com/VinylStage/finance-tracker/commit/939388bf765467cc4c58c8999dd5eb5bf52dba79))
* 서버 기동 boilerplate 2개 파일을 공용 헬퍼로 이관한다 ([#379](https://github.com/VinylStage/finance-tracker/issues/379) 5차 배치) ([#427](https://github.com/VinylStage/finance-tracker/issues/427)) ([fa01fbf](https://github.com/VinylStage/finance-tracker/commit/fa01fbf155d0c48234abf92f1f0cbcc3472e19b8))
* 서버 기동 boilerplate 5개 파일 이관 — 2차 배치 ([#379](https://github.com/VinylStage/finance-tracker/issues/379)) ([#389](https://github.com/VinylStage/finance-tracker/issues/389)) ([5dba690](https://github.com/VinylStage/finance-tracker/commit/5dba6900a4b47363d6f197a2be03ac61250ecf84))
* 서버 기동 boilerplate 5개 파일을 공용 헬퍼로 이관한다 ([#379](https://github.com/VinylStage/finance-tracker/issues/379)) ([#388](https://github.com/VinylStage/finance-tracker/issues/388)) ([44dbb3f](https://github.com/VinylStage/finance-tracker/commit/44dbb3fd791aa4be782079e153db1f2c9e5e0a0c))
* 서버 조기 종료를 즉시 감지하는 공용 헬퍼 ([#379](https://github.com/VinylStage/finance-tracker/issues/379)) ([#385](https://github.com/VinylStage/finance-tracker/issues/385)) ([e3e353d](https://github.com/VinylStage/finance-tracker/commit/e3e353d173decb4a735b85df98bca015eab540fd))
* 스모크에서 빠져 있던 페이지 네 개를 채운다 ([#466](https://github.com/VinylStage/finance-tracker/issues/466)) ([#467](https://github.com/VinylStage/finance-tracker/issues/467)) ([d065443](https://github.com/VinylStage/finance-tracker/commit/d0654437b4597cbc798b58308f34d2a65e8b087f))
* 스모크에서 차트 라이브러리를 스텁으로 바꾼다 ([#429](https://github.com/VinylStage/finance-tracker/issues/429)) ([#433](https://github.com/VinylStage/finance-tracker/issues/433)) ([995bfdc](https://github.com/VinylStage/finance-tracker/commit/995bfdc74c2c03c00b07fb7eabffb0c7dc7cec41))
* 안 덮여 있던 오류 응답 두 곳에 테스트를 붙인다 ([#448](https://github.com/VinylStage/finance-tracker/issues/448)) ([#449](https://github.com/VinylStage/finance-tracker/issues/449)) ([37c00ef](https://github.com/VinylStage/finance-tracker/commit/37c00efd003eda7c0c0c7ed9a5902d407f3732a6))
* 적금 만기 이자 수입이 실제로 거래로 남는지 확인한다 ([#455](https://github.com/VinylStage/finance-tracker/issues/455)) ([2a56e5c](https://github.com/VinylStage/finance-tracker/commit/2a56e5ca0c209fa4b2c2b653660834a84b9bcf01))
* 카드 전략 화면을 스모크 목록에 넣는다 (감사 S2 후속) ([#417](https://github.com/VinylStage/finance-tracker/issues/417)) ([2c9824f](https://github.com/VinylStage/finance-tracker/commit/2c9824fc147bbe39a79c1ede59b9d480392b5f75))
* 카드정책 구간 검증의 경계와 라우트 400 경로를 덮는다 ([#434](https://github.com/VinylStage/finance-tracker/issues/434)) ([#446](https://github.com/VinylStage/finance-tracker/issues/446)) ([dfba14d](https://github.com/VinylStage/finance-tracker/commit/dfba14d44c64df4e1d317efa73243128da95e67c))
* 클라이언트 커버리지 게이트를 실측에 맞춘다 (감사 S3) ([#407](https://github.com/VinylStage/finance-tracker/issues/407)) ([e3f31d2](https://github.com/VinylStage/finance-tracker/commit/e3f31d2845b4839ff60cb40905d1334aab31961a))
* 클라이언트 커버리지 임계값을 재실측에 맞춘다 ([#418](https://github.com/VinylStage/finance-tracker/issues/418)) ([c89dfa8](https://github.com/VinylStage/finance-tracker/commit/c89dfa8db12d731c986e0483b5165b67a2a5e2af))
* 페이지 8개에 스모크 렌더를 건다 (감사 S2) ([#408](https://github.com/VinylStage/finance-tracker/issues/408)) ([160ab00](https://github.com/VinylStage/finance-tracker/commit/160ab00a5b05ceafb2860ccfdd1409c4db578952))


### Refactoring

* **db:** 019 의 개별 트리거 재생성 호출을 제거한다 ([#346](https://github.com/VinylStage/finance-tracker/issues/346)) ([#360](https://github.com/VinylStage/finance-tracker/issues/360)) ([d16bbd9](https://github.com/VinylStage/finance-tracker/commit/d16bbd9d198c7b2b42d12e3ece19eb3ab3f282f2))
* **db:** 감사 트리거 재생성을 마이그레이션 러너가 책임진다 ([#346](https://github.com/VinylStage/finance-tracker/issues/346)) ([#356](https://github.com/VinylStage/finance-tracker/issues/356)) ([70d1781](https://github.com/VinylStage/finance-tracker/commit/70d1781384254de2f248090c3a9a08e015b41f1a))
* **ui:** 월 달력 격자를 MonthCalendarGrid 로 추출 ([#303](https://github.com/VinylStage/finance-tracker/issues/303)) ([#310](https://github.com/VinylStage/finance-tracker/issues/310)) ([141a982](https://github.com/VinylStage/finance-tracker/commit/141a982f2e931bfa4c80c4ae8bcf41f3ef4cc522))
* 금액 포매터를 lib/format.js 로 모은다 ([#236](https://github.com/VinylStage/finance-tracker/issues/236)) ([#391](https://github.com/VinylStage/finance-tracker/issues/391)) ([f328762](https://github.com/VinylStage/finance-tracker/commit/f328762610a933384988b3e18aa0595e96e2015c))

## [0.9.0](https://github.com/VinylStage/finance-tracker/compare/v0.8.0...v0.9.0) (2026-07-29)


### Features

* **ui:** Pretendard 한글·라틴 고빈도 서브셋 self-host ([#244](https://github.com/VinylStage/finance-tracker/issues/244)) ([#252](https://github.com/VinylStage/finance-tracker/issues/252)) ([0fc9d32](https://github.com/VinylStage/finance-tracker/commit/0fc9d32540f362bba97311775cf55f8d0a5f9090))
* **ui:** 모바일 하단 탭바를 인라인 SVG 아이콘으로 재구성 ([#246](https://github.com/VinylStage/finance-tracker/issues/246)) ([#262](https://github.com/VinylStage/finance-tracker/issues/262)) ([c5424bb](https://github.com/VinylStage/finance-tracker/commit/c5424bb35ee042009790a773dcab6a291598ce2b))
* **ui:** 설정 페이지 좌측 앵커 목차 ([#245](https://github.com/VinylStage/finance-tracker/issues/245)) ([#260](https://github.com/VinylStage/finance-tracker/issues/260)) ([d7fdffb](https://github.com/VinylStage/finance-tracker/commit/d7fdffb69af545edab44777508b9a353ed6e9805))
* **ui:** 시각 디자인 토큰 체계 전면 교체 ([#240](https://github.com/VinylStage/finance-tracker/issues/240)) ([#248](https://github.com/VinylStage/finance-tracker/issues/248)) ([892bc7e](https://github.com/VinylStage/finance-tracker/commit/892bc7e7453b19a9913ff46720fd834d2dd1843e))
* **ui:** 인라인 SVG 아이콘 기반 도입 ([#244](https://github.com/VinylStage/finance-tracker/issues/244)) ([#251](https://github.com/VinylStage/finance-tracker/issues/251)) ([fa18bed](https://github.com/VinylStage/finance-tracker/commit/fa18bed9fd08a715c30142c20f5f85c37425ba85))
* **ui:** 일별 지출 강도 캘린더 히트맵 ([#242](https://github.com/VinylStage/finance-tracker/issues/242)) ([#259](https://github.com/VinylStage/finance-tracker/issues/259)) ([6ae544d](https://github.com/VinylStage/finance-tracker/commit/6ae544d7a19074121d181e82357a1ece0a7f9986))
* **ui:** 자금 흐름 100% 스택 바와 목록 ([#241](https://github.com/VinylStage/finance-tracker/issues/241)) ([#261](https://github.com/VinylStage/finance-tracker/issues/261)) ([a8542a5](https://github.com/VinylStage/finance-tracker/commit/a8542a5b23c0258aa4859b5a0a158da76c7d0978))
* **ui:** 카테고리 아이콘 배선과 남은 이모지 제거 ([#244](https://github.com/VinylStage/finance-tracker/issues/244), [#254](https://github.com/VinylStage/finance-tracker/issues/254)) ([#256](https://github.com/VinylStage/finance-tracker/issues/256)) ([410556c](https://github.com/VinylStage/finance-tracker/commit/410556c4465743949f36a5d6bdaa7be77e15273d))


### Bug Fixes

* 스택 PR 이 잘못된 base 로 머지돼 누락된 모듈 복구 ([#241](https://github.com/VinylStage/finance-tracker/issues/241), [#242](https://github.com/VinylStage/finance-tracker/issues/242)) ([#253](https://github.com/VinylStage/finance-tracker/issues/253)) ([af53eb1](https://github.com/VinylStage/finance-tracker/commit/af53eb1dfc067622a34a34eea286d9ec7389b04e))


### Maintenance

* **release:** develop → main 릴리즈 (시각 디자인 리뉴얼 사이클) ([037e1b5](https://github.com/VinylStage/finance-tracker/commit/037e1b539a81c8bf42b018da330f782c3fbed33b))


### Documentation

* **audit:** 미시정 결함 재현 상세를 비공개 저장소로 분리 ([#205](https://github.com/VinylStage/finance-tracker/issues/205)) ([#255](https://github.com/VinylStage/finance-tracker/issues/255)) ([208c711](https://github.com/VinylStage/finance-tracker/commit/208c7113cca63ac44aaad04b057664064c714691))
* **audit:** 설계 절충 예외 대장을 신설하고 line-strong 미달을 등재 ([#247](https://github.com/VinylStage/finance-tracker/issues/247)) ([#263](https://github.com/VinylStage/finance-tracker/issues/263)) ([8969a61](https://github.com/VinylStage/finance-tracker/commit/8969a61c6108765112a759842d3e2dfad3955396))

## [0.8.0](https://github.com/VinylStage/finance-tracker/compare/v0.7.0...v0.8.0) (2026-07-28)


### Features

* **ui:** IA 5그룹 재구성 + wouter URL 라우팅 도입 ([#215](https://github.com/VinylStage/finance-tracker/issues/215)) ([8a43bf3](https://github.com/VinylStage/finance-tracker/commit/8a43bf33ace4ec11365b0ad9a031204cf089caa8))
* **ui:** 거래 빠른입력 UX 개선 — 모달 전환·최근 가맹점 원탭·잔여예산 인라인 ([#224](https://github.com/VinylStage/finance-tracker/issues/224)) ([f175cc4](https://github.com/VinylStage/finance-tracker/commit/f175cc486e1fb829e68923d0c23d64ab457096ee)), closes [#196](https://github.com/VinylStage/finance-tracker/issues/196)
* **ui:** 거래 테이블 모바일 카드뷰 전환 — 컬럼 숨김 제거 ([#216](https://github.com/VinylStage/finance-tracker/issues/216)) ([1db9a6a](https://github.com/VinylStage/finance-tracker/commit/1db9a6ac06764cf680ae7802999abcac7d708856))
* **ui:** 다크모드 도입 ([#201](https://github.com/VinylStage/finance-tracker/issues/201)) ([#227](https://github.com/VinylStage/finance-tracker/issues/227)) ([a2fdae3](https://github.com/VinylStage/finance-tracker/commit/a2fdae3504f82d6431dad5c9a2cd499679a26613))
* **ui:** 대시보드 하위 섹션 기본 접힘 처리 ([#219](https://github.com/VinylStage/finance-tracker/issues/219)) ([eb11fdb](https://github.com/VinylStage/finance-tracker/commit/eb11fdb3b5a2c6020943f2bb7bbe1732250dea4c))
* **ui:** 시맨틱 디자인 토큰 시스템 도입 ([#213](https://github.com/VinylStage/finance-tracker/issues/213)) ([c77cd49](https://github.com/VinylStage/finance-tracker/commit/c77cd49b2c63b7546bd9d277c7a6b3ff1c94cdb0))
* **ui:** 신뢰 마이크로카피 + 마지막 내보내기 시각 표시 ([#222](https://github.com/VinylStage/finance-tracker/issues/222)) ([c18c158](https://github.com/VinylStage/finance-tracker/commit/c18c158020cd64faf122ae1ec90b2039d1b531af))
* **ui:** 예산 진행바 손실회피 프레이밍 3단계 전환 ([#217](https://github.com/VinylStage/finance-tracker/issues/217)) ([e90f601](https://github.com/VinylStage/finance-tracker/commit/e90f601ae3c131a908c8f99d31004346b6b6ff76))
* **ui:** 저축 목표 진행바 goal-gradient 도입 ([#220](https://github.com/VinylStage/finance-tracker/issues/220)) ([726fb0c](https://github.com/VinylStage/finance-tracker/commit/726fb0c8bb92254dda1b4570d084a2c4c13ad915)), closes [#200](https://github.com/VinylStage/finance-tracker/issues/200)
* **ui:** 최초 실행 온보딩 + 공통 EmptyState 도입 ([#223](https://github.com/VinylStage/finance-tracker/issues/223)) ([5b4c7bf](https://github.com/VinylStage/finance-tracker/commit/5b4c7bf6e894d0ffe76ba4039bc3c695f919fe06)), closes [#197](https://github.com/VinylStage/finance-tracker/issues/197)
* **ui:** 카테고리별 지출 랭킹 막대 기본 뷰 + 파이 Top5 캡핑 ([#218](https://github.com/VinylStage/finance-tracker/issues/218)) ([604e5aa](https://github.com/VinylStage/finance-tracker/commit/604e5aa99b4166bbe1796cf4faa5d0fe35450d4e))


### Bug Fixes

* **a11y:** 카테고리 대분류를 색상+아이콘+텍스트 3중 인코딩으로 전환 ([#214](https://github.com/VinylStage/finance-tracker/issues/214)) ([a1b7c0d](https://github.com/VinylStage/finance-tracker/commit/a1b7c0d840d4403c44e6f9e48ba6fc41c7b740f3))
* **ui:** CSP 가 막던 다크모드 부트스트랩을 외부 스크립트로 분리 ([#228](https://github.com/VinylStage/finance-tracker/issues/228)) ([#229](https://github.com/VinylStage/finance-tracker/issues/229)) ([67bd82e](https://github.com/VinylStage/finance-tracker/commit/67bd82e82661766b812bf670556b58cfd924da2f))
* 사용자에게 노출되던 개발자용 에러 메시지 정리 ([#231](https://github.com/VinylStage/finance-tracker/issues/231)) ([#232](https://github.com/VinylStage/finance-tracker/issues/232)) ([3b59c3f](https://github.com/VinylStage/finance-tracker/commit/3b59c3fe831e35412f71490819791ea9d6175a1e))
* 숫자 필드 검증을 선언적 미들웨어로 전환 ([#211](https://github.com/VinylStage/finance-tracker/issues/211)) ([#233](https://github.com/VinylStage/finance-tracker/issues/233)) ([3bf38f0](https://github.com/VinylStage/finance-tracker/commit/3bf38f09beb0cb87d618b8be2dc5bd6532cbee57))


### Maintenance

* **process:** 문서 변경 승인 게이트(confirm-chain) 배선 ([#209](https://github.com/VinylStage/finance-tracker/issues/209)) ([8d25a21](https://github.com/VinylStage/finance-tracker/commit/8d25a21503bb74b5c49932c148d82ef41337b24f))


### Documentation

* **audit:** 2라운드 PDCA 교차검토 — A1 판정 정정 + 신규결함 3건 근본원인 ([#207](https://github.com/VinylStage/finance-tracker/issues/207)) ([74eef24](https://github.com/VinylStage/finance-tracker/commit/74eef243679612beb6999801604f2969cacaa370))
* **audit:** 2차 독립 감사 보고서 — 루브릭 21항목 실측 재판정 (R2) ([#204](https://github.com/VinylStage/finance-tracker/issues/204)) ([33bda4d](https://github.com/VinylStage/finance-tracker/commit/33bda4dc9ec0dc9f040a1dcf4d495951e684cf05))
* **audit:** 루브릭에 위협모델 예외 판정 절차 명문화 — N/A 대신 Pass/Partial 흡수 ([#208](https://github.com/VinylStage/finance-tracker/issues/208)) ([3f67ddd](https://github.com/VinylStage/finance-tracker/commit/3f67dddc2ba786f717255a5a728288dc6b7ae7f1))
* UI/UX 개편 설계 문서 추가 ([#203](https://github.com/VinylStage/finance-tracker/issues/203)) ([3374ad4](https://github.com/VinylStage/finance-tracker/commit/3374ad461b0c3097102c013ed47b75646319fd2b))
* 개발팀 자체평가(2라운드) — 독립 감사와 병행 ([#187](https://github.com/VinylStage/finance-tracker/issues/187)) ([5ebd030](https://github.com/VinylStage/finance-tracker/commit/5ebd030058a78ae3b7ac79a63c5a3c8d5856aa3d))
* 마이크로카피/보이스톤 가이드 신설 ([#221](https://github.com/VinylStage/finance-tracker/issues/221)) ([633d83b](https://github.com/VinylStage/finance-tracker/commit/633d83bf4b180ea363e728d7a7e4769293a1cd54)), closes [#202](https://github.com/VinylStage/finance-tracker/issues/202)
* 인증·세션 전략 ADR 신설 ([#189](https://github.com/VinylStage/finance-tracker/issues/189)) ([#230](https://github.com/VinylStage/finance-tracker/issues/230)) ([c334263](https://github.com/VinylStage/finance-tracker/commit/c3342634f10b6636ded21edd7abd3138c4e482a0))

## [0.7.0](https://github.com/VinylStage/finance-tracker/compare/v0.6.0...v0.7.0) (2026-07-26)


### Features

* **#153:** Lighthouse 3회 측정 스크립트 도입, 성능 기준선 기록(C1~C3) ([#182](https://github.com/VinylStage/finance-tracker/issues/182)) ([275674a](https://github.com/VinylStage/finance-tracker/commit/275674aa79778700d616828f54f036ecba2c418b))
* M5 잔여 이슈 3건 — 라우트 테스트/할부 자동완료/데이터 무결성/커버리지 계측 ([#183](https://github.com/VinylStage/finance-tracker/issues/183)) ([4f5cf46](https://github.com/VinylStage/finance-tracker/commit/4f5cf46594791b418b90a620b92489e56ab2963c))


### Bug Fixes

* **#139:** 거래내역 500건 클램프 근본해결 — 검색·집계 서버 파라미터화 (A안) ([#171](https://github.com/VinylStage/finance-tracker/issues/171)) ([9ca9efe](https://github.com/VinylStage/finance-tracker/commit/9ca9efe78ba6c63c2c5430e361ea526f700cc7f9))
* **#140:** 설정 복원을 DELETE+INSERT에서 UPSERT로 전환, 확인 토큰 추가 ([#167](https://github.com/VinylStage/finance-tracker/issues/167)) ([6fb7b37](https://github.com/VinylStage/finance-tracker/commit/6fb7b3752b18bfb043abeb45621cc70719e09b56))
* **#141:** 할부 청구액 계산을 대시보드와 통일, 집계 규칙/날짜 헬퍼 중복 제거 ([#168](https://github.com/VinylStage/finance-tracker/issues/168)) ([5174ffb](https://github.com/VinylStage/finance-tracker/commit/5174ffb9a0a1acf6f4baed547ff97f3e21b31495))
* **#142:** 리볼빙/부채/백업임포트 금액 필드에 asInt 검증 적용 ([#169](https://github.com/VinylStage/finance-tracker/issues/169)) ([0cc89f8](https://github.com/VinylStage/finance-tracker/commit/0cc89f8a4987e900e808b6f355d61c94d08fe0f5))
* **#143:** 할부 경과월 계산의 UTC 'now' 의존 제거(KST 자정~9시 오차) ([#170](https://github.com/VinylStage/finance-tracker/issues/170)) ([6874c1c](https://github.com/VinylStage/finance-tracker/commit/6874c1cceee594ca96c26a17e437102a1f953442))
* **#144:** cashflow.js의 N+1 쿼리 제거, transactions.js와 rangeTotalsByDate 공유 ([#172](https://github.com/VinylStage/finance-tracker/issues/172)) ([64a35b1](https://github.com/VinylStage/finance-tracker/commit/64a35b1825bf2367f706364a2bfd06b72362853c))
* **#145:** 비sargable WHERE를 범위 비교로 재작성, installments 인덱스 추가 ([#173](https://github.com/VinylStage/finance-tracker/issues/173)) ([36728f8](https://github.com/VinylStage/finance-tracker/commit/36728f84f8d8ffcacf8a890463346205dd04e3d0))
* **#146:** /api/* 전용 404 핸들러 추가 ([#174](https://github.com/VinylStage/finance-tracker/issues/174)) ([4250bd4](https://github.com/VinylStage/finance-tracker/commit/4250bd46339cf5a4f56ae883e81fd5ef8e371b3c))
* **#147:** GET /api/settings가 내부 에러 메시지를 노출하던 문제 수정 ([#175](https://github.com/VinylStage/finance-tracker/issues/175)) ([628983b](https://github.com/VinylStage/finance-tracker/commit/628983b72c91b238e6ffc9c5b4f5a67895003848))
* **#150:** stocks.js가 모든 에러를 "미활성화"로 삼키고 로깅 안 하던 문제 수정 ([#176](https://github.com/VinylStage/finance-tracker/issues/176)) ([fdd96a1](https://github.com/VinylStage/finance-tracker/commit/fdd96a15c82329864303a20a959c06596fe29033))
* **#151:** 폼 입력요소 79개 전체에 접근성 라벨 부여(FND-21) ([#180](https://github.com/VinylStage/finance-tracker/issues/180)) ([996c84c](https://github.com/VinylStage/finance-tracker/commit/996c84c5a9946a7e681cce53b9e6cbeef271dde4))
* **ci:** 문법검사 게이트가 실패를 감지하지 못하는 문제 수정 ([#133](https://github.com/VinylStage/finance-tracker/issues/133)) ([#155](https://github.com/VinylStage/finance-tracker/issues/155)) ([c644282](https://github.com/VinylStage/finance-tracker/commit/c644282a008d3a118ef3fce39b714fd5ee3c18b5))
* **security:** CSRF 방어 미들웨어 도입 ([#134](https://github.com/VinylStage/finance-tracker/issues/134)) ([#158](https://github.com/VinylStage/finance-tracker/issues/158)) ([2c660f1](https://github.com/VinylStage/finance-tracker/commit/2c660f1743ce87f3d8661a40cd1043437ec2584f))
* **security:** export 라우트 Content-Disposition 헤더 인젝션 방지 ([#137](https://github.com/VinylStage/finance-tracker/issues/137)) ([#161](https://github.com/VinylStage/finance-tracker/issues/161)) ([aa0200f](https://github.com/VinylStage/finance-tracker/commit/aa0200f89451f1b72089be935dd9ff24b3674f53))
* **security:** 보안 헤더 추가 + 전역 에러 미들웨어 + React ErrorBoundary ([#135](https://github.com/VinylStage/finance-tracker/issues/135)) ([#159](https://github.com/VinylStage/finance-tracker/issues/159)) ([a873ddd](https://github.com/VinylStage/finance-tracker/commit/a873dddd2ac72934f490e71bb49abbe45c5620b6))
* **security:** 카드 임포트 업로드 파일 크기/형식 제한 ([#136](https://github.com/VinylStage/finance-tracker/issues/136)) ([#160](https://github.com/VinylStage/finance-tracker/issues/160)) ([0acf6f6](https://github.com/VinylStage/finance-tracker/commit/0acf6f6da383d427e58a7e5c497e3c12000434da))


### Maintenance

* **deps-dev:** bump @vitejs/plugin-react in /client ([#166](https://github.com/VinylStage/finance-tracker/issues/166)) ([8e59306](https://github.com/VinylStage/finance-tracker/commit/8e59306be221dd4540da12d28d3b1062a2f2cbf7))
* **deps:** bump react-dom from 19.2.7 to 19.2.8 in /client ([#163](https://github.com/VinylStage/finance-tracker/issues/163)) ([17cf158](https://github.com/VinylStage/finance-tracker/commit/17cf158c5ccdd6dca22f6bdbd6559045d1e5a9d7))
* **deps:** bump recharts from 3.10.0 to 3.10.1 in /client ([#165](https://github.com/VinylStage/finance-tracker/issues/165)) ([0e57fde](https://github.com/VinylStage/finance-tracker/commit/0e57fde99b2bd7b8d657dd098894e0eb3c97fdeb))
* **security:** 공급망 게이트 추가 — dependabot.yml + CI npm audit ([#138](https://github.com/VinylStage/finance-tracker/issues/138)) ([#162](https://github.com/VinylStage/finance-tracker/issues/162)) ([647f858](https://github.com/VinylStage/finance-tracker/commit/647f85819ebef138d079b7e668686b41de4a903e))


### Documentation

* **#149:** 핵심 문서 3종의 라우트/페이지 목록을 코드 기준으로 갱신 ([#179](https://github.com/VinylStage/finance-tracker/issues/179)) ([fb2860b](https://github.com/VinylStage/finance-tracker/commit/fb2860b023ffa34c53aa973eb976ad267f3092a4))
* **audit:** 2026-07 사이클1 독립 코드 감사 보고서 추가 ([4c40ccf](https://github.com/VinylStage/finance-tracker/commit/4c40ccf78f27bca891e4f83b80061273b34abdae))
* **audit:** PDCA 1라운드 교차검토 — 감사팀↔개발팀 양방향 재검토 ([#184](https://github.com/VinylStage/finance-tracker/issues/184)) ([78cf793](https://github.com/VinylStage/finance-tracker/commit/78cf793e57236f64df1034ab44a7532062386cb2))

## [0.6.0](https://github.com/VinylStage/finance-tracker/compare/v0.5.0...v0.6.0) (2026-07-25)


### Features

* 거래내역 검색·필터 고도화 — 가맹점/금액범위/결제수단/메모/다중카테고리 ([#126](https://github.com/VinylStage/finance-tracker/issues/126)) ([#127](https://github.com/VinylStage/finance-tracker/issues/127)) ([029c737](https://github.com/VinylStage/finance-tracker/commit/029c737d7ff1405fe4b1876dda85142a78e5aa9d))
* 완전 고정금액 반복 거래 자동등록 ([#128](https://github.com/VinylStage/finance-tracker/issues/128)) ([#129](https://github.com/VinylStage/finance-tracker/issues/129)) ([fe342ba](https://github.com/VinylStage/finance-tracker/commit/fe342ba668321e789b398bad59f1d438e90d7eb9))
* 카드 임포트 경로를 카드사별 단일 경로로 통합 ([#120](https://github.com/VinylStage/finance-tracker/issues/120)) ([4f4d98c](https://github.com/VinylStage/finance-tracker/commit/4f4d98c61cec4741aa88ec129e8a020580c24c3f))


### Bug Fixes

* **deps:** xlsx high 취약점 2건 해소 — 벤더링 CDN 패치본 교체 ([#112](https://github.com/VinylStage/finance-tracker/issues/112)) ([28b6aa7](https://github.com/VinylStage/finance-tracker/commit/28b6aa7f70d96d2e6f4a660e25effb93f8d8cc97))
* payment_style/major_type 허용값을 애플리케이션 레벨에서 검증 ([#90](https://github.com/VinylStage/finance-tracker/issues/90)) ([#119](https://github.com/VinylStage/finance-tracker/issues/119)) ([b66c7f2](https://github.com/VinylStage/finance-tracker/commit/b66c7f28a1955ed8a48ebc6fe605f28b8cc479c4))
* toISOString() 로컬 날짜 생성 버그 수정 ([#75](https://github.com/VinylStage/finance-tracker/issues/75)) ([#114](https://github.com/VinylStage/finance-tracker/issues/114)) ([bb0bccb](https://github.com/VinylStage/finance-tracker/commit/bb0bccb877eaed38102c869cd8a320a753c3b5f0))
* 입력 검증 구멍 2건 수정 ([#104](https://github.com/VinylStage/finance-tracker/issues/104)) ([#116](https://github.com/VinylStage/finance-tracker/issues/116)) ([2fdb069](https://github.com/VinylStage/finance-tracker/commit/2fdb0692aca66c0cf21c58081791d77be244daf0))


### Maintenance

* DB 마이그레이션 버전 관리 도입 ([#89](https://github.com/VinylStage/finance-tracker/issues/89)) ([#118](https://github.com/VinylStage/finance-tracker/issues/118)) ([9697bae](https://github.com/VinylStage/finance-tracker/commit/9697bae60d7f6724c5b1f8a040b09a930234cef7))
* 방어적 견고성 개선 2건 — headersSent 가드, e.message 안전 접근 ([#105](https://github.com/VinylStage/finance-tracker/issues/105)) ([#123](https://github.com/VinylStage/finance-tracker/issues/123)) ([a41808d](https://github.com/VinylStage/finance-tracker/commit/a41808d5bf93fb2758426ab2fade3cd22fb57fa8))


### Documentation

* **audit:** 독립 코드 감사 프레임워크 추가 ([#115](https://github.com/VinylStage/finance-tracker/issues/115)) ([ff2b1fb](https://github.com/VinylStage/finance-tracker/commit/ff2b1fb817890d86428915d662a6cff62a6a4c20))

## [0.5.0](https://github.com/VinylStage/finance-tracker/compare/v0.4.0...v0.5.0) (2026-07-25)


### Features

* **card-import:** 카드사 엑셀 여러 파일 한 번에 임포트 ([#102](https://github.com/VinylStage/finance-tracker/issues/102)) ([#106](https://github.com/VinylStage/finance-tracker/issues/106)) ([517ea7e](https://github.com/VinylStage/finance-tracker/commit/517ea7efa82084c1fa9757d820dec9c250e974f4))


### Bug Fixes

* **backup:** export/import 왕복에서 결제방식·결제수단·승인번호 보존 ([#77](https://github.com/VinylStage/finance-tracker/issues/77)) ([#94](https://github.com/VinylStage/finance-tracker/issues/94)) ([6de0937](https://github.com/VinylStage/finance-tracker/commit/6de09374e06f99c6b480e5e6bbd92e967f782c09))
* **card-import:** 업로드 엑셀 파서 크래시 방어 + 파서 오류 400 응답 ([#79](https://github.com/VinylStage/finance-tracker/issues/79)) ([#96](https://github.com/VinylStage/finance-tracker/issues/96)) ([6a8a0a5](https://github.com/VinylStage/finance-tracker/commit/6a8a0a5823a1cfb90ac35a27b870687306d564cd))
* **ci:** release-please if 조건 제거 — 릴리즈 태그 발행 차단 해소 ([#68](https://github.com/VinylStage/finance-tracker/issues/68)) ([79afead](https://github.com/VinylStage/finance-tracker/commit/79afead2fcf1ede1385b82ffc0f5cb0dd9c3ee1b))
* **csv:** 카드사 CSV 파싱 정확성 3건 — 금액 절단, 날짜 미정규화, CRLF ([#78](https://github.com/VinylStage/finance-tracker/issues/78)) ([#95](https://github.com/VinylStage/finance-tracker/issues/95)) ([f170d94](https://github.com/VinylStage/finance-tracker/commit/f170d9430b041c663fd686821c3247a3aa3c63d1))
* **dashboard:** 종료된 할부가 가용현금에서 계속 차감되던 문제 수정 ([#76](https://github.com/VinylStage/finance-tracker/issues/76)) ([#93](https://github.com/VinylStage/finance-tracker/issues/93)) ([12ef014](https://github.com/VinylStage/finance-tracker/commit/12ef014742c1a3b18a31c28c02fd9b5fefa56b20))
* **data:** import 본문 제한 정상화 + overwrite 확인 토큰 요구 ([#80](https://github.com/VinylStage/finance-tracker/issues/80)) ([#97](https://github.com/VinylStage/finance-tracker/issues/97)) ([f43f1d4](https://github.com/VinylStage/finance-tracker/commit/f43f1d491d924fc375660e7ee8b3549bcf74ce46))
* **server:** HOST 환경변수로 바인딩 제어, 기본값을 루프백으로 ([#72](https://github.com/VinylStage/finance-tracker/issues/72)) ([#73](https://github.com/VinylStage/finance-tracker/issues/73)) ([9a61f98](https://github.com/VinylStage/finance-tracker/commit/9a61f98e432e2f7c5d0727c6e46839ba7621b1fc))
* **services:** 외부 API 호출 타임아웃 + 시크릿 마스킹 + KIS 환경변수 ([#83](https://github.com/VinylStage/finance-tracker/issues/83)) ([#100](https://github.com/VinylStage/finance-tracker/issues/100)) ([750cc80](https://github.com/VinylStage/finance-tracker/commit/750cc80b6dc8f627c6df215759b3230b78577590))
* **transactions:** 페이지네이션 total이 필터를 반영하도록 + limit/offset 검증 ([#81](https://github.com/VinylStage/finance-tracker/issues/81)) ([#98](https://github.com/VinylStage/finance-tracker/issues/98)) ([e0c49a5](https://github.com/VinylStage/finance-tracker/commit/e0c49a568d69220bd7405949c9e50057b6f7bb09))


### Maintenance

* **docs:** 브랜치 보호 규칙 및 bypass 조건 문서화 ([#69](https://github.com/VinylStage/finance-tracker/issues/69)) ([#74](https://github.com/VinylStage/finance-tracker/issues/74)) ([c4ee927](https://github.com/VinylStage/finance-tracker/commit/c4ee9277777922bad184ebcb3183833d13e550c0))
* **errors:** 500 응답에서 내부 메시지 노출 제거 (36곳) ([#84](https://github.com/VinylStage/finance-tracker/issues/84)) ([#101](https://github.com/VinylStage/finance-tracker/issues/101)) ([dbd1fb7](https://github.com/VinylStage/finance-tracker/commit/dbd1fb7009f216f1a44ed4d4a33caa394184017b))
* **hygiene:** 죽은 코드 제거, N+1 쿼리 제거, KIS TODO 정리, 리볼빙 인덱스 문서화 ([#87](https://github.com/VinylStage/finance-tracker/issues/87)) ([#109](https://github.com/VinylStage/finance-tracker/issues/109)) ([4635993](https://github.com/VinylStage/finance-tracker/commit/4635993511606e16f058bf341a0dffc9bd88ea8f))
* **opencode:** 프로젝트 레벨 로컬 에이전트 설정 추가 ([#70](https://github.com/VinylStage/finance-tracker/issues/70)) ([37785ed](https://github.com/VinylStage/finance-tracker/commit/37785ede6bb32ee423b63b70139461e85e875d25))
* **validation:** 입력 검증 일괄 보강 — amount 타입, PUT 필수/404, 설정 숫자, LIKE 이스케이프 ([#82](https://github.com/VinylStage/finance-tracker/issues/82)) ([#99](https://github.com/VinylStage/finance-tracker/issues/99)) ([309ce01](https://github.com/VinylStage/finance-tracker/commit/309ce01b220f67723f846ffe1bf18624eb3c3f1d))


### Documentation

* **adr:** xlsx 취약점 리스크 수용 결정 기록 ([#64](https://github.com/VinylStage/finance-tracker/issues/64)) ([#71](https://github.com/VinylStage/finance-tracker/issues/71)) ([ee55ffd](https://github.com/VinylStage/finance-tracker/commit/ee55ffddbd0f13f70742600d48f7df1aedb9f9fb))

## [0.4.0](https://github.com/VinylStage/finance-tracker/compare/v0.3.0...v0.4.0) (2026-07-24)


### Features

* **data:** add transaction backup/restore (append/overwrite) ([#52](https://github.com/VinylStage/finance-tracker/issues/52)) ([0458395](https://github.com/VinylStage/finance-tracker/commit/04583957f62927952ee757c2af65d7e95a21d7be)), closes [#34](https://github.com/VinylStage/finance-tracker/issues/34)
* **guide:** UI 가이드 페이지 추가 및 마크다운 문서화 ([#56](https://github.com/VinylStage/finance-tracker/issues/56)) ([#63](https://github.com/VinylStage/finance-tracker/issues/63)) ([d7d160e](https://github.com/VinylStage/finance-tracker/commit/d7d160ef40c12e233a19c2bb4b129ea140850e92))
* **import:** 카드사 엑셀 임포트 (농협·롯데·삼성·하나·현대) ([#55](https://github.com/VinylStage/finance-tracker/issues/55)) ([0579344](https://github.com/VinylStage/finance-tracker/commit/05793442394bc00880c6cc6d7369b9eefea10fd7))
* **transactions:** shift+클릭 체크박스 범위선택 ([#61](https://github.com/VinylStage/finance-tracker/issues/61)) ([7f1221b](https://github.com/VinylStage/finance-tracker/commit/7f1221bbde557807d1075a3deae86f87aa3913cd))
* 거래 일괄삭제 및 전체 초기화 기능 ([#60](https://github.com/VinylStage/finance-tracker/issues/60)) ([01cb9d4](https://github.com/VinylStage/finance-tracker/commit/01cb9d48125d6a042f2017b3a35747aa2dc5cf1a))


### Bug Fixes

* **card-import:** 승인번호 기반 중복 체크로 오탐 방지 ([#57](https://github.com/VinylStage/finance-tracker/issues/57)) ([#62](https://github.com/VinylStage/finance-tracker/issues/62)) ([b6472ec](https://github.com/VinylStage/finance-tracker/commit/b6472ec0d40b8b0e9325d1622b0988f561340138))
* **ci:** release-please 워크플로우 자기 재트리거 루프 방지 ([#58](https://github.com/VinylStage/finance-tracker/issues/58)) ([2d4e37d](https://github.com/VinylStage/finance-tracker/commit/2d4e37d37fa0e6e92cbbe9d025c7c010c583d674))


### Maintenance

* **release:** merge develop into main for v0.4.0 release ([c2fc72c](https://github.com/VinylStage/finance-tracker/commit/c2fc72cb35342c8bc12b8cf9309e0a20749b4629))

## [0.3.0](https://github.com/VinylStage/finance-tracker/compare/v0.2.1...v0.3.0) (2026-07-23)


### Features

* automated weekly maintenance audit workflow ([#23](https://github.com/VinylStage/finance-tracker/issues/23)) ([64fefdd](https://github.com/VinylStage/finance-tracker/commit/64fefdd6bdeea46dd4502d115854fb7b2471f498))
* category auto-suggest UX polish ([#4](https://github.com/VinylStage/finance-tracker/issues/4)) ([536093a](https://github.com/VinylStage/finance-tracker/commit/536093ad666d2b8540bb13e4dbefe9aa98250a16))
* **csv-import:** add card statement CSV import preview (hana/samsung/hyundai/shinhan) ([4a85ef8](https://github.com/VinylStage/finance-tracker/commit/4a85ef8b2f547c82599ddae7d60c9c65c656282b))
* **exchange:** add ECOS/Exim external API services and exchange rate route ([b7a0510](https://github.com/VinylStage/finance-tracker/commit/b7a05109cc266209af9a4acefa9f0ca42f20902b))
* local Ollama research script for GitHub issues ([#26](https://github.com/VinylStage/finance-tracker/issues/26)) ([161ff1b](https://github.com/VinylStage/finance-tracker/commit/161ff1b4ff8687caa1ba1383b2f0ffa40e3d45e3))
* minus-tongjang debts, transaction grouping, dashboard charts ([14cbe21](https://github.com/VinylStage/finance-tracker/commit/14cbe210b4b08402c3c061e650be801a26fefe48)), closes [#12](https://github.com/VinylStage/finance-tracker/issues/12) [#13](https://github.com/VinylStage/finance-tracker/issues/13) [#14](https://github.com/VinylStage/finance-tracker/issues/14)
* **phase2:** installments, revolving, debts UI ([f72080e](https://github.com/VinylStage/finance-tracker/commit/f72080e9032a502381d97dc3655a80e6c0803092)), closes [#1](https://github.com/VinylStage/finance-tracker/issues/1) [#2](https://github.com/VinylStage/finance-tracker/issues/2) [#3](https://github.com/VinylStage/finance-tracker/issues/3)
* **phase4:** category expense chart with period + bar/line toggle ([edc331d](https://github.com/VinylStage/finance-tracker/commit/edc331d4cda7ba3088315049454de0df12909f6b)), closes [#6](https://github.com/VinylStage/finance-tracker/issues/6)
* **phase4:** dedicated cashflow endpoint + month-over-month comparison ([1de14ad](https://github.com/VinylStage/finance-tracker/commit/1de14adf9783b90b5dc4d596ad6cb9f7cfe0c88d)), closes [#5](https://github.com/VinylStage/finance-tracker/issues/5)
* **phase5:** balance simulator ([9aac83d](https://github.com/VinylStage/finance-tracker/commit/9aac83d1eb5808e0dece53ab55e875e34f6db788)), closes [#7](https://github.com/VinylStage/finance-tracker/issues/7)
* **phase5:** savings/insurance ledger with maturity handling ([24b2549](https://github.com/VinylStage/finance-tracker/commit/24b25495e32fcf0962d6b0ccd017cc0ff9fa278e)), closes [#16](https://github.com/VinylStage/finance-tracker/issues/16)
* **phase6:** CSV/JSON export + settings page ([9d7233c](https://github.com/VinylStage/finance-tracker/commit/9d7233cb3efa53e5525b8cef3cb925d96fd3cea4)), closes [#8](https://github.com/VinylStage/finance-tracker/issues/8) [#9](https://github.com/VinylStage/finance-tracker/issues/9)
* **settings:** add category/payment-method edit and reactivate UI ([d9bd5cb](https://github.com/VinylStage/finance-tracker/commit/d9bd5cb4eaa544a9b8b5b4c3314c3d2232bf61a2))
* **settings:** add settings-only backup and restore ([966e3d7](https://github.com/VinylStage/finance-tracker/commit/966e3d7fe189e2b0442f56eaa1904197f4be5d81))
* **stocks:** add KIS API stub (disabled) ([5288401](https://github.com/VinylStage/finance-tracker/commit/5288401e106c6753a3fd5944c2731808469cc0e5))
* 기간 비교 차트 (일/주/월/연 전기간 대비) ([f009d1f](https://github.com/VinylStage/finance-tracker/commit/f009d1f0b82ec20dd6f1f7f30ee0f7950ce1ef26)), closes [#27](https://github.com/VinylStage/finance-tracker/issues/27)
* 데이터 내보내기 및 마이그레이션 지원 (CSV/JSON) ([d2e8853](https://github.com/VinylStage/finance-tracker/commit/d2e8853e6ab3602f90ca699653de37ba948d9ac9)), closes [#28](https://github.com/VinylStage/finance-tracker/issues/28)


### Bug Fixes

* **dashboard:** replace daily-expense bar chart with area chart ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* **deps:** upgrade vite to 6.4.3, resolve client audit vulnerabilities ([d397f4d](https://github.com/VinylStage/finance-tracker/commit/d397f4ddff263a4379122b98ab87f84f0fe29282))
* **env:** add missing env vars to .env.example ([45ac22e](https://github.com/VinylStage/finance-tracker/commit/45ac22e7e4c58eedaf6d1c4a312c694e7944e279))
* **phase6:** mobile nav overflow + performance verification ([0dfeabb](https://github.com/VinylStage/finance-tracker/commit/0dfeabbcb20947533ee3032536a17fc4925d73a7)), closes [#17](https://github.com/VinylStage/finance-tracker/issues/17)
* release-please target-branch 고정 및 v0.2.1 버전 정상화 ([#44](https://github.com/VinylStage/finance-tracker/issues/44)) ([2a26de9](https://github.com/VinylStage/finance-tracker/commit/2a26de92726cb61a607c7a213f20e10ceeb7324f))


### Maintenance

* add branch workflow, CONTRIBUTING.md, release-please setup ([#35](https://github.com/VinylStage/finance-tracker/issues/35)) ([1a5063d](https://github.com/VinylStage/finance-tracker/commit/1a5063def601db5850e542f161419570b755578b))
* add GitHub SDLC templates (ISO 12207 기반) ([834b768](https://github.com/VinylStage/finance-tracker/commit/834b7683cdd6990cb033b7882e9f594f061af14c)), closes [#21](https://github.com/VinylStage/finance-tracker/issues/21)
* better-sqlite3 v11→v13 업그레이드 ([#24](https://github.com/VinylStage/finance-tracker/issues/24)) ([281d42a](https://github.com/VinylStage/finance-tracker/commit/281d42a37df0df49bb01f64d4b7341e64e5c90a7))
* **ci:** add GitHub Actions CI workflow (build + syntax check) ([#39](https://github.com/VinylStage/finance-tracker/issues/39)) ([e090da9](https://github.com/VinylStage/finance-tracker/commit/e090da941a5c977aea3591ef281d437616f233b7)), closes [#30](https://github.com/VinylStage/finance-tracker/issues/30)
* develop 브랜치 전략 도입 ([#40](https://github.com/VinylStage/finance-tracker/issues/40)) ([#42](https://github.com/VinylStage/finance-tracker/issues/42)) ([f0b4109](https://github.com/VinylStage/finance-tracker/commit/f0b4109f6ebb134041987f4fa5e03c608a9045cc))
* initial project scaffold (Phase 0+1 complete) ([406ae1b](https://github.com/VinylStage/finance-tracker/commit/406ae1be10003036b267ade14fdbee3ecf33c2ce))
* **main:** release 0.2.0 ([#38](https://github.com/VinylStage/finance-tracker/issues/38)) ([42b0dfe](https://github.com/VinylStage/finance-tracker/commit/42b0dfe9aed6d5138820ed817364293eed8a2011))
* **maintenance:** upgrade React 18 -&gt; 19 + Tailwind v3 -&gt; v4 ([0e3c5cb](https://github.com/VinylStage/finance-tracker/commit/0e3c5cbcf9917e090f5605d8343647a4102de388)), closes [#20](https://github.com/VinylStage/finance-tracker/issues/20)
* **maintenance:** upgrade recharts v2 -&gt; v3 ([9ee762a](https://github.com/VinylStage/finance-tracker/commit/9ee762aa06ce59c5b64f3bcf3e463f6fc3bb33f8)), closes [#18](https://github.com/VinylStage/finance-tracker/issues/18)
* release v0.2.2 ([#47](https://github.com/VinylStage/finance-tracker/issues/47)) ([51b4f0d](https://github.com/VinylStage/finance-tracker/commit/51b4f0d4bc945f9863524a943d597f1c86a61011))
* remove GITHUB_ISSUES.md, migrate to GitHub Milestones ([df31385](https://github.com/VinylStage/finance-tracker/commit/df31385d60ed60057325672b99f7e6cb83b3af94))
* remove internal planning/design docs for public release ([22b65d1](https://github.com/VinylStage/finance-tracker/commit/22b65d1bc03aeae62ddafb6eea147fda18d46573))
* remove node_modules/public from tracking, add .env.example ([cb2ad3c](https://github.com/VinylStage/finance-tracker/commit/cb2ad3c95f30fff37205d5af549aa75aa7089615))
* remove xlsx (migration complete, no longer needed) ([c630653](https://github.com/VinylStage/finance-tracker/commit/c6306535cda851d00a0a7a91e7d1aa8e2ee4c348))
* remove xlsx migration path, seed generic categories/payment methods ([#22](https://github.com/VinylStage/finance-tracker/issues/22)) ([20a2519](https://github.com/VinylStage/finance-tracker/commit/20a251994624a3be70ad3e1644361679afe7bd2c))
* **server:** mount exchange, stocks, csv-import routes ([f877ebf](https://github.com/VinylStage/finance-tracker/commit/f877ebfed7288734a719b35c5bd097e38ed87f53))
* vite/plugin-react 업그레이드 ([#25](https://github.com/VinylStage/finance-tracker/issues/25)) ([938db53](https://github.com/VinylStage/finance-tracker/commit/938db531123f60a4d33877bdeda09dcd2084d38f))
* 이슈 우선순위 라벨 시스템 도입 ([#37](https://github.com/VinylStage/finance-tracker/issues/37)) ([b2d3bd5](https://github.com/VinylStage/finance-tracker/commit/b2d3bd57f7a5dd216edb826a10e473481271dc1f))


### Documentation

* add docs/diagrams/ — 5 Mermaid process diagrams (system ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* add GitHub Issues draft reference (Phase 2-6) ([9e001cf](https://github.com/VinylStage/finance-tracker/commit/9e001cf9250630bdcf189c5438ecbd83f84f8ca0))
* add multi-agent team org & protocols (AGENTS.md) ([96b789a](https://github.com/VinylStage/finance-tracker/commit/96b789ae0b3cc49d8e7fe78df8c16e569da9a93c))
* **adr:** add 0001-transaction-table-separation.md ([0fa7239](https://github.com/VinylStage/finance-tracker/commit/0fa7239880ff87117c895bd6532f40a5e1d5a1c8))
* **adr:** add 0002-sqlite-choice.md ([ede5b82](https://github.com/VinylStage/finance-tracker/commit/ede5b82a75e687dc368a378ddac5a8ded045f344))
* **api:** add API.md ([7089470](https://github.com/VinylStage/finance-tracker/commit/7089470571c83c1828173fc80d1967652bcc31fe))
* ARCHITECTURE.md 한국어 변환, 이슈 기반 프로세스 도입 ([44031c9](https://github.com/VinylStage/finance-tracker/commit/44031c9c68ff766b3be8420b745d856e2a9b8e74))
* **architecture:** add ARCHITECTURE.md ([e63e29a](https://github.com/VinylStage/finance-tracker/commit/e63e29ab657c9eaa7522549d78a4f942507c894c))
* **architecture:** add ARCHITECTURE.md ([a400fcc](https://github.com/VinylStage/finance-tracker/commit/a400fcc88c025379efa2681e8e8261bc8897c290))
* **audit:** add IMPLEMENTATION_AUDIT.md ([33538c4](https://github.com/VinylStage/finance-tracker/commit/33538c4c46a3bc245f0e6e8f6a9549133b1edf82))
* **changelog:** add CHANGELOG.md ([1489f7e](https://github.com/VinylStage/finance-tracker/commit/1489f7e1c934435524f6caa5cf1275c0dea1fbb3))
* **data-model:** add DATA_MODEL.md ([9b160e8](https://github.com/VinylStage/finance-tracker/commit/9b160e8826b46f612e3e9f73169322e7f871ecf8))
* README 한국어 전환 ([571030f](https://github.com/VinylStage/finance-tracker/commit/571030f1f1e3dd7edab2d7a2d586f28adf2c44fb))
* remove deprecated Korean-named docs, English only ([1e0fb5e](https://github.com/VinylStage/finance-tracker/commit/1e0fb5e66fdd520e8c1d1bdc8826514689a76c72))
* **requirements:** add REQUIREMENTS.md ([51662f5](https://github.com/VinylStage/finance-tracker/commit/51662f5cfefb7979e87303f43cf6383bdee492e7))
* **roadmap:** add ROADMAP.md ([19a659d](https://github.com/VinylStage/finance-tracker/commit/19a659d985b6a93520aaa71904da0690897ebd06))
* translate REQUIREMENTS.md and AGENTS.md content to Korean ([a2a919d](https://github.com/VinylStage/finance-tracker/commit/a2a919d0e76d3808057fba262dc541a939862392))
* translate ROADMAP.md content to Korean ([767f122](https://github.com/VinylStage/finance-tracker/commit/767f122d5b4cc590af04e2af140777848d03411c))

## [0.2.1](https://github.com/VinylStage/finance-tracker/compare/v0.2.0...v0.2.1) (2026-07-23)


### Maintenance

* develop 브랜치 전략 도입 ([#40](https://github.com/VinylStage/finance-tracker/issues/40)) ([500e28e](https://github.com/VinylStage/finance-tracker/commit/500e28e48ed12f040dd4067421368b910fd0b94c))

## [0.2.0](https://github.com/VinylStage/finance-tracker/compare/v0.1.0...v0.2.0) (2026-07-23)


### Features

* automated weekly maintenance audit workflow ([#23](https://github.com/VinylStage/finance-tracker/issues/23)) ([64fefdd](https://github.com/VinylStage/finance-tracker/commit/64fefdd6bdeea46dd4502d115854fb7b2471f498))
* category auto-suggest UX polish ([#4](https://github.com/VinylStage/finance-tracker/issues/4)) ([536093a](https://github.com/VinylStage/finance-tracker/commit/536093ad666d2b8540bb13e4dbefe9aa98250a16))
* **csv-import:** add card statement CSV import preview (hana/samsung/hyundai/shinhan) ([4a85ef8](https://github.com/VinylStage/finance-tracker/commit/4a85ef8b2f547c82599ddae7d60c9c65c656282b))
* **exchange:** add ECOS/Exim external API services and exchange rate route ([b7a0510](https://github.com/VinylStage/finance-tracker/commit/b7a05109cc266209af9a4acefa9f0ca42f20902b))
* local Ollama research script for GitHub issues ([#26](https://github.com/VinylStage/finance-tracker/issues/26)) ([161ff1b](https://github.com/VinylStage/finance-tracker/commit/161ff1b4ff8687caa1ba1383b2f0ffa40e3d45e3))
* minus-tongjang debts, transaction grouping, dashboard charts ([14cbe21](https://github.com/VinylStage/finance-tracker/commit/14cbe210b4b08402c3c061e650be801a26fefe48)), closes [#12](https://github.com/VinylStage/finance-tracker/issues/12) [#13](https://github.com/VinylStage/finance-tracker/issues/13) [#14](https://github.com/VinylStage/finance-tracker/issues/14)
* **phase2:** installments, revolving, debts UI ([f72080e](https://github.com/VinylStage/finance-tracker/commit/f72080e9032a502381d97dc3655a80e6c0803092)), closes [#1](https://github.com/VinylStage/finance-tracker/issues/1) [#2](https://github.com/VinylStage/finance-tracker/issues/2) [#3](https://github.com/VinylStage/finance-tracker/issues/3)
* **phase4:** category expense chart with period + bar/line toggle ([edc331d](https://github.com/VinylStage/finance-tracker/commit/edc331d4cda7ba3088315049454de0df12909f6b)), closes [#6](https://github.com/VinylStage/finance-tracker/issues/6)
* **phase4:** dedicated cashflow endpoint + month-over-month comparison ([1de14ad](https://github.com/VinylStage/finance-tracker/commit/1de14adf9783b90b5dc4d596ad6cb9f7cfe0c88d)), closes [#5](https://github.com/VinylStage/finance-tracker/issues/5)
* **phase5:** balance simulator ([9aac83d](https://github.com/VinylStage/finance-tracker/commit/9aac83d1eb5808e0dece53ab55e875e34f6db788)), closes [#7](https://github.com/VinylStage/finance-tracker/issues/7)
* **phase5:** savings/insurance ledger with maturity handling ([24b2549](https://github.com/VinylStage/finance-tracker/commit/24b25495e32fcf0962d6b0ccd017cc0ff9fa278e)), closes [#16](https://github.com/VinylStage/finance-tracker/issues/16)
* **phase6:** CSV/JSON export + settings page ([9d7233c](https://github.com/VinylStage/finance-tracker/commit/9d7233cb3efa53e5525b8cef3cb925d96fd3cea4)), closes [#8](https://github.com/VinylStage/finance-tracker/issues/8) [#9](https://github.com/VinylStage/finance-tracker/issues/9)
* **settings:** add category/payment-method edit and reactivate UI ([d9bd5cb](https://github.com/VinylStage/finance-tracker/commit/d9bd5cb4eaa544a9b8b5b4c3314c3d2232bf61a2))
* **settings:** add settings-only backup and restore ([966e3d7](https://github.com/VinylStage/finance-tracker/commit/966e3d7fe189e2b0442f56eaa1904197f4be5d81))
* **stocks:** add KIS API stub (disabled) ([5288401](https://github.com/VinylStage/finance-tracker/commit/5288401e106c6753a3fd5944c2731808469cc0e5))
* 기간 비교 차트 (일/주/월/연 전기간 대비) ([f009d1f](https://github.com/VinylStage/finance-tracker/commit/f009d1f0b82ec20dd6f1f7f30ee0f7950ce1ef26)), closes [#27](https://github.com/VinylStage/finance-tracker/issues/27)
* 데이터 내보내기 및 마이그레이션 지원 (CSV/JSON) ([d2e8853](https://github.com/VinylStage/finance-tracker/commit/d2e8853e6ab3602f90ca699653de37ba948d9ac9)), closes [#28](https://github.com/VinylStage/finance-tracker/issues/28)


### Bug Fixes

* **dashboard:** replace daily-expense bar chart with area chart ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* **deps:** upgrade vite to 6.4.3, resolve client audit vulnerabilities ([d397f4d](https://github.com/VinylStage/finance-tracker/commit/d397f4ddff263a4379122b98ab87f84f0fe29282))
* **env:** add missing env vars to .env.example ([45ac22e](https://github.com/VinylStage/finance-tracker/commit/45ac22e7e4c58eedaf6d1c4a312c694e7944e279))
* **phase6:** mobile nav overflow + performance verification ([0dfeabb](https://github.com/VinylStage/finance-tracker/commit/0dfeabbcb20947533ee3032536a17fc4925d73a7)), closes [#17](https://github.com/VinylStage/finance-tracker/issues/17)


### Maintenance

* add branch workflow, CONTRIBUTING.md, release-please setup ([#35](https://github.com/VinylStage/finance-tracker/issues/35)) ([1a5063d](https://github.com/VinylStage/finance-tracker/commit/1a5063def601db5850e542f161419570b755578b))
* add GitHub SDLC templates (ISO 12207 기반) ([834b768](https://github.com/VinylStage/finance-tracker/commit/834b7683cdd6990cb033b7882e9f594f061af14c)), closes [#21](https://github.com/VinylStage/finance-tracker/issues/21)
* better-sqlite3 v11→v13 업그레이드 ([#24](https://github.com/VinylStage/finance-tracker/issues/24)) ([281d42a](https://github.com/VinylStage/finance-tracker/commit/281d42a37df0df49bb01f64d4b7341e64e5c90a7))
* initial project scaffold (Phase 0+1 complete) ([406ae1b](https://github.com/VinylStage/finance-tracker/commit/406ae1be10003036b267ade14fdbee3ecf33c2ce))
* **maintenance:** upgrade React 18 -&gt; 19 + Tailwind v3 -&gt; v4 ([0e3c5cb](https://github.com/VinylStage/finance-tracker/commit/0e3c5cbcf9917e090f5605d8343647a4102de388)), closes [#20](https://github.com/VinylStage/finance-tracker/issues/20)
* **maintenance:** upgrade recharts v2 -&gt; v3 ([9ee762a](https://github.com/VinylStage/finance-tracker/commit/9ee762aa06ce59c5b64f3bcf3e463f6fc3bb33f8)), closes [#18](https://github.com/VinylStage/finance-tracker/issues/18)
* remove GITHUB_ISSUES.md, migrate to GitHub Milestones ([df31385](https://github.com/VinylStage/finance-tracker/commit/df31385d60ed60057325672b99f7e6cb83b3af94))
* remove internal planning/design docs for public release ([22b65d1](https://github.com/VinylStage/finance-tracker/commit/22b65d1bc03aeae62ddafb6eea147fda18d46573))
* remove node_modules/public from tracking, add .env.example ([cb2ad3c](https://github.com/VinylStage/finance-tracker/commit/cb2ad3c95f30fff37205d5af549aa75aa7089615))
* remove xlsx (migration complete, no longer needed) ([c630653](https://github.com/VinylStage/finance-tracker/commit/c6306535cda851d00a0a7a91e7d1aa8e2ee4c348))
* remove xlsx migration path, seed generic categories/payment methods ([#22](https://github.com/VinylStage/finance-tracker/issues/22)) ([20a2519](https://github.com/VinylStage/finance-tracker/commit/20a251994624a3be70ad3e1644361679afe7bd2c))
* **server:** mount exchange, stocks, csv-import routes ([f877ebf](https://github.com/VinylStage/finance-tracker/commit/f877ebfed7288734a719b35c5bd097e38ed87f53))
* vite/plugin-react 업그레이드 ([#25](https://github.com/VinylStage/finance-tracker/issues/25)) ([938db53](https://github.com/VinylStage/finance-tracker/commit/938db531123f60a4d33877bdeda09dcd2084d38f))
* 이슈 우선순위 라벨 시스템 도입 ([#37](https://github.com/VinylStage/finance-tracker/issues/37)) ([b2d3bd5](https://github.com/VinylStage/finance-tracker/commit/b2d3bd57f7a5dd216edb826a10e473481271dc1f))


### Documentation

* add docs/diagrams/ — 5 Mermaid process diagrams (system ([ac90cff](https://github.com/VinylStage/finance-tracker/commit/ac90cffb13f14df75234761c3c5582e9f45d6c55))
* add GitHub Issues draft reference (Phase 2-6) ([9e001cf](https://github.com/VinylStage/finance-tracker/commit/9e001cf9250630bdcf189c5438ecbd83f84f8ca0))
* add multi-agent team org & protocols (AGENTS.md) ([96b789a](https://github.com/VinylStage/finance-tracker/commit/96b789ae0b3cc49d8e7fe78df8c16e569da9a93c))
* **adr:** add 0001-transaction-table-separation.md ([0fa7239](https://github.com/VinylStage/finance-tracker/commit/0fa7239880ff87117c895bd6532f40a5e1d5a1c8))
* **adr:** add 0002-sqlite-choice.md ([ede5b82](https://github.com/VinylStage/finance-tracker/commit/ede5b82a75e687dc368a378ddac5a8ded045f344))
* **api:** add API.md ([7089470](https://github.com/VinylStage/finance-tracker/commit/7089470571c83c1828173fc80d1967652bcc31fe))
* ARCHITECTURE.md 한국어 변환, 이슈 기반 프로세스 도입 ([44031c9](https://github.com/VinylStage/finance-tracker/commit/44031c9c68ff766b3be8420b745d856e2a9b8e74))
* **architecture:** add ARCHITECTURE.md ([e63e29a](https://github.com/VinylStage/finance-tracker/commit/e63e29ab657c9eaa7522549d78a4f942507c894c))
* **architecture:** add ARCHITECTURE.md ([a400fcc](https://github.com/VinylStage/finance-tracker/commit/a400fcc88c025379efa2681e8e8261bc8897c290))
* **audit:** add IMPLEMENTATION_AUDIT.md ([33538c4](https://github.com/VinylStage/finance-tracker/commit/33538c4c46a3bc245f0e6e8f6a9549133b1edf82))
* **changelog:** add CHANGELOG.md ([1489f7e](https://github.com/VinylStage/finance-tracker/commit/1489f7e1c934435524f6caa5cf1275c0dea1fbb3))
* **data-model:** add DATA_MODEL.md ([9b160e8](https://github.com/VinylStage/finance-tracker/commit/9b160e8826b46f612e3e9f73169322e7f871ecf8))
* README 한국어 전환 ([571030f](https://github.com/VinylStage/finance-tracker/commit/571030f1f1e3dd7edab2d7a2d586f28adf2c44fb))
* remove deprecated Korean-named docs, English only ([1e0fb5e](https://github.com/VinylStage/finance-tracker/commit/1e0fb5e66fdd520e8c1d1bdc8826514689a76c72))
* **requirements:** add REQUIREMENTS.md ([51662f5](https://github.com/VinylStage/finance-tracker/commit/51662f5cfefb7979e87303f43cf6383bdee492e7))
* **roadmap:** add ROADMAP.md ([19a659d](https://github.com/VinylStage/finance-tracker/commit/19a659d985b6a93520aaa71904da0690897ebd06))
* translate REQUIREMENTS.md and AGENTS.md content to Korean ([a2a919d](https://github.com/VinylStage/finance-tracker/commit/a2a919d0e76d3808057fba262dc541a939862392))
* translate ROADMAP.md content to Korean ([767f122](https://github.com/VinylStage/finance-tracker/commit/767f122d5b4cc590af04e2af140777848d03411c))

## [Unreleased]

### Added
- 기간 비교 차트 (일/주/월/연 전기간 대비)
- 데이터 내보내기 및 마이그레이션 지원 (CSV/JSON)
- Automated weekly maintenance audit workflow
- Local Ollama research script for GitHub issues
- GitHub SDLC templates (ISO 12207 기반)
- Multi-agent team org & protocols (AGENTS.md)
- GitHub Issues draft reference (Phase 2-6)
- ROADMAP.md with roadmap content
- ARCHITECTURE.md with architecture information
- DATA_MODEL.md with data model information
- API.md with API documentation
- REQUIREMENTS.md with requirements
- ADRs (0001-transaction-table-separation.md, 0002-sqlite-choice.md)

### Changed
- Dashboard: replace daily-expense bar chart with area chart
- README: Korean translation
- ROADMAP.md: Korean translation
- ARCHITECTURE.md: Korean translation and issue-based process introduction
- UI: Installments, revolving, debts
- Category auto-suggest UX polish
- Cashflow endpoint with month-over-month comparison
- Category expense chart with period + bar/line toggle
- Balance simulator
- Savings/insurance ledger with maturity handling
- Mobile nav overflow + performance verification
- React from v18 to v19
- Tailwind from v3 to v4
- Recharts from v2 to v3
- Vite from v6.4.3 to 6.4.3 (upgrade dependencies)
- better-sqlite3 from v11 to v13

### Fixed
- Dependencies: upgrade vite to resolve client audit vulnerabilities

### Deprecated
- Node_modules/public from tracking
- XLSX (migration complete, no longer needed)
- Internal planning/design docs for public release
- GITHUB_ISSUES.md, migrated to GitHub Milestones
