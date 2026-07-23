# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
