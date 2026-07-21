# Agent Team — Organization & Protocols

This project is developed and maintained by a multi-agent team under human oversight.
All agents operate under the **User (Commander)** as the final authority.

---

## Org Chart

```
User (Commander / 총사령관)
└── EVA  ← orchestrator, confirms before escalating to User
    ├── AXEL  ← Mac-side execution, git, server ops
    │   ├── FORGE  ← code & UI implementation
    │   └── VANCE  ← general implementation & docs
    ├── NEXUS  ← design, planning, scheduling
    └── ORACLE  ← deep analysis & fallback reasoning
```

---

## Agents

### EVA — Executive Virtual Arbiter
- **Platform:** Claude Sonnet (Cowork / Dispatch orchestrator)
- **Model:** claude-sonnet-4-6
- **Role:** Chief of Staff / 중간 부회장
- **Responsibilities:**
  - Translate user intent → detailed prompts → agent assignments
  - Manage confirm chain (FORGE/VANCE → AXEL → EVA → User)
  - Does NOT write code or run shell commands directly
  - Routes design work to NEXUS, execution to AXEL
- **Session type:** Cowork (primary)

### AXEL — Automated eXecution Engine & Logic
- **Platform:** Claude Code (CLI, Mac-side)
- **Model:** claude-sonnet-4-6 (Code session)
- **Role:** Executor / 실행 에이전트
- **Responsibilities:**
  - Git operations (commit, push, branch)
  - npm install, build, migration, server start
  - Cloudflare tunnel, `gh` CLI for GitHub issues
  - Delegates code writing specs to FORGE/VANCE via opencode/aider
- **Session type:** Code (single active session preferred)
- **Rule:** Single idle session reuse — never spawn new session for simple commands

### NEXUS — Network EXecution & Unit Scheduler
- **Platform:** Claude Sonnet (Cowork secondary)
- **Model:** claude-sonnet-4-6
- **Role:** Planner / 계획 수립
- **Responsibilities:**
  - Detailed phase design documents
  - GitHub Issues drafting
  - Local LLM scheduling coordination
- **Session type:** Cowork (child dispatch)

### VANCE — primary local LLM worker
- **Platform:** Ollama (local, Apple Silicon)
- **Model:** `qwen3.5:35b-a3b` (32K ctx, balanced)
- **Role:** General implementation — docs, email mapping, Phase 2/3 main work
- **Invocation:** via `curl http://localhost:11434/api/generate`
- **Constraints:** Single concurrent call only; check for existing processes before calling

### FORGE — code & UI specialist
- **Platform:** Ollama (local, Apple Silicon)
- **Model:** `qwen3-coder:30b` (speed-optimized)
- **Role:** UI development, scripts, code generation
- **Invocation:** via `curl http://localhost:11434/api/generate`
- **Constraints:** Single concurrent call only

### ORACLE — deep reasoning
- **Platform:** Ollama (local, Apple Silicon)
- **Model:** `deepseek-r1:70b` (~42GB RAM)
- **Role:** Complex analysis, security review, architectural decisions, fallback
- **Invocation:** via `curl http://localhost:11434/api/generate`
- **CRITICAL CONSTRAINTS:**
  - **Single synchronous call only** — no concurrent calls ever
  - Pre-call: `pkill -f "curl.*11434" && sleep 2`
  - Timeout: 480s (`--max-time 480`); kill & retry if >8min
  - Cannot run simultaneously with VANCE or FORGE (48GB RAM limit)
  - Do not load ORACLE if other models are actively running

---

## Confirm Chain

```
FORGE/VANCE/ORACLE
    ↓ (implementation complete)
AXEL/NEXUS
    ↓ (1st verification: logic & correctness)
EVA
    ↓ (2nd confirmation: spec match & scope)
User
    ↓ (final approval for: arch changes, cost actions, data changes)
```

**User confirmation required for:**
- Architecture / data model changes
- New dependencies (npm packages, models)
- Cloudflare tunnel / public exposure
- API cost actions
- Calendar / Gmail write operations

---

## Session Hygiene Rules

1. **Before spawning any new Code session:** check existing sessions with `list_sessions`. Reuse idle sessions.
2. **Simple commands** (git, server restart, ollama check): use existing idle Code session via `send_message`. Never create a new session.
3. **Dispatch timeout ≠ session not created** — always verify session list before re-spawning.
4. **ORACLE**: pre-flight `ps aux | grep "curl.*11434"` — kill any existing before calling.

---

## Work Assignment Principles

- **EVA** formats requirements as specs (what, constraints, output format) — not direct code instructions
- **AXEL** designs logic only; delegates implementation specs to FORGE/VANCE
- **Local LLMs** receive requirement documents, not code snippets
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`) — push after every commit
- **Never commit:** `*.db`, `ref/*.xlsx`, `node_modules/`, `.env`

---

## Ollama Standard Call Pattern

```bash
# Safe ORACLE call
pkill -f "curl.*11434" 2>/dev/null; sleep 2
curl -s --max-time 480 http://localhost:11434/api/generate \
  -d '{"model":"deepseek-r1:70b","prompt":"...","stream":false}'

# VANCE / FORGE call (check no ORACLE running first)
curl -s --max-time 120 http://localhost:11434/api/generate \
  -d '{"model":"qwen3.5:35b-a3b","prompt":"...","stream":false}'
```
