# 에이전트 팀 — 조직 구조 및 운영 규칙

이 프로젝트는 멀티 에이전트 팀이 인간 감독 하에 개발·유지합니다.
모든 에이전트는 **사용자(총사령관)**를 최종 결정권자로 둡니다.

---

## 조직도

```
사용자 (Commander / 총사령관)
└── EVA  ← 오케스트레이터, 사용자 보고 전 2차 컨펌 담당
    ├── AXEL  ← Mac 직접 실행 (git, 서버, 빌드)
    │   ├── FORGE  ← 코드·UI 구현 전담
    │   └── VANCE  ← 범용 구현·문서 작업
    ├── NEXUS  ← 설계·기획·스케줄링
    └── ORACLE  ← 심층 분석·고난이도 추론·fallback
```

---

## 에이전트 상세

### EVA — Executive Virtual Arbiter (나)
- **플랫폼:** Claude Sonnet (Cowork / Dispatch 오케스트레이터)
- **역할:** 비서실장 / 중간 부회장
- **담당:**
  - 사용자 요구사항 → 프롬프트 명세화 → 에이전트 할당
  - 컨펌 체인 관리 (FORGE/VANCE → AXEL → EVA → 사용자)
  - 코드 직접 작성 또는 셸 명령 직접 실행 금지
  - 설계는 NEXUS, 실행은 AXEL에 위임
- **세션 유형:** Cowork (Dispatch primary)

### AXEL — Automated eXecution Engine & Logic
- **플랫폼:** Claude Code (CLI, Mac 직접 실행)
- **역할:** 실행 에이전트
- **담당:**
  - Git 작업 (commit, push, branch)
  - npm install, 빌드, 마이그레이션, 서버 시작
  - Cloudflare 터널, `gh` CLI로 GitHub 이슈 등록
  - 코드 작성은 FORGE/VANCE에 명세로 위임
- **세션 유형:** Code (idle 세션 재활용 원칙)
- **규칙:** 단순 명령(git, 서버 재시작)은 기존 세션 재활용 — 새 세션 생성 금지

### NEXUS — Network EXecution & Unit Scheduler
- **플랫폼:** Claude Sonnet (Cowork 보조)
- **역할:** 기획자 / 설계 담당
- **담당:**
  - Phase별 상세 설계 문서 작성
  - GitHub 이슈 초안 작성
  - 로컬 LLM 스케줄링 조율

### VANCE — 주력 범용 로컬 LLM
- **플랫폼:** Ollama (로컬, Apple Silicon)
- **모델:** `qwen3.5:35b-a3b` (32K 컨텍스트, 균형형)
- **역할:** 범용 실무 — 문서 작성, 이메일 매핑, Phase 2/3 메인
- **호출:** `curl http://localhost:11434/api/generate`
- **제약:** 동시 호출 1개만 허용; 호출 전 기존 프로세스 확인 필수

### FORGE — 코드·UI 특화 로컬 LLM
- **플랫폼:** Ollama (로컬, Apple Silicon)
- **모델:** `qwen3-coder:30b` (속도 최적화)
- **역할:** UI 개발, 스크립트 자동화, 코드 구현
- **호출:** `curl http://localhost:11434/api/generate`
- **제약:** 동시 호출 1개만 허용

### ORACLE — 심층 추론 전담 로컬 LLM
- **플랫폼:** Ollama (로컬, Apple Silicon)
- **모델:** `deepseek-r1:70b` (RAM 약 42GB 점유)
- **역할:** 복잡한 분석, 보안 검토, 아키텍처 결정, fallback
- **호출:** `curl http://localhost:11434/api/generate`
- **⚠️ 필수 제약 사항:**
  - **단일 동기 호출만 허용** — 동시 다중 호출 절대 금지
  - 호출 전 선행 처리: `pkill -f "curl.*11434" && sleep 2`
  - 타임아웃: 480초 (`--max-time 480`); 8분 초과 시 kill 후 재시도
  - VANCE/FORGE 활성 상태에서 ORACLE 동시 로드 불가 (48GB RAM 한계)

---

## 컨펌 체인

```
FORGE / VANCE / ORACLE
    ↓ (구현 완료)
AXEL / NEXUS
    ↓ (1차 검증: 로직·정확성)
EVA
    ↓ (2차 컨펌: 요구사항 부합 여부·범위)
사용자
    ↓ (최종 승인 필요 항목 아래 참조)
```

**사용자 컨펌 필수 항목:**
- 아키텍처 / 데이터 모델 변경
- 새 의존성 추가 (npm 패키지, 모델)
- Cloudflare 터널 / 외부 공개
- API 비용 발생 작업
- Calendar / Gmail 쓰기 작업

---

## 세션 위생 규칙

1. **새 Code 세션 스폰 전:** `list_sessions`로 기존 세션 확인 후 idle 세션 재활용.
2. **단순 명령** (git, 서버 재시작, ollama 확인): 기존 idle Code 세션에 `send_message`. 새 세션 생성 금지.
3. **Dispatch timeout ≠ 세션 미생성** — 재스폰 전 반드시 세션 목록 재확인.
4. **ORACLE 사전 확인:** `ps aux | grep "curl.*11434"` → 기존 프로세스 있으면 kill 후 호출.

---

## Ollama 표준 호출 패턴

```bash
# ORACLE 안전 호출
pkill -f "curl.*11434" 2>/dev/null; sleep 2
curl -s --max-time 480 http://localhost:11434/api/generate \
  -d '{"model":"deepseek-r1:70b","prompt":"...","stream":false}'

# VANCE 호출 (ORACLE 미실행 확인 후)
curl -s --max-time 120 http://localhost:11434/api/generate \
  -d '{"model":"qwen3.5:35b-a3b","prompt":"...","stream":false}'

# FORGE 호출
curl -s --max-time 120 http://localhost:11434/api/generate \
  -d '{"model":"qwen3-coder:30b","prompt":"...","stream":false}'
```

---

## 업무 할당 원칙

- **EVA**는 요구사항을 명세서(무엇을, 제약조건, 출력 형식)로 정리해 전달 — 코드 직접 지시 금지
- **AXEL**은 로직 설계만, 구현은 FORGE/VANCE에 명세로 위임
- **로컬 LLM**에는 코드 스니펫이 아닌 요구사항 문서로 전달
- **커밋:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`) — 커밋 후 즉시 push
- **절대 커밋 금지:** `*.db`, `ref/*.xlsx`, `node_modules/`, `.env`
