# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
