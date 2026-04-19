# Weave — 사용자 매뉴얼

> English: [MANUAL.md](MANUAL.md)

Weave 는 에이전트 코딩 CLI 용 워크플로우 컴포저 — Claude Code, opencode, Gemini CLI, Copilot CLI 지원. 설치된 CLI 의 플러그인·익스텐션에서 스킬을 자동 디스커버해서 **재사용 가능한 preset**으로 엮고, step-by-step 실행을 오케스트레이션한다. 세션 상태를 파일시스템에 저장하기 때문에 컨텍스트 compaction·rollback·세션 간 재개가 가능하다.

---

## 목차

1. [설치](#1-설치)
2. [핵심 개념](#2-핵심-개념)
3. [커맨드 레퍼런스](#3-커맨드-레퍼런스)
4. [처음부터 끝까지 워크스루](#4-처음부터-끝까지-워크스루)
5. [Scope — project vs global](#5-scope--project-vs-global)
6. [Context compaction & 세션 복구](#6-context-compaction--세션-복구)
7. [CLI (스크립팅용)](#7-cli-스크립팅용)
8. [Preset JSON 구조](#8-preset-json-구조)
9. [문제 해결](#9-문제-해결)
10. [파일 위치](#10-파일-위치)
11. [Stage 분류 체계 (compose 그룹 기준)](#11-stage-분류-체계-compose-그룹-기준)
12. [뱃지 레퍼런스](#12-뱃지-레퍼런스)

---

## 1. 설치

**지원 CLI:** Claude Code, opencode, Gemini CLI, Copilot CLI. Codex CLI 는 지원하지 않는다 (어떤 설치 타겟의 스킬 루트와도 겹치지 않음).

weave 리포 디렉토리에서:

```bash
node install.js                                       # 구성된 CLI 자동 감지
node install.js --target=claude                       # Claude Code 만
node install.js --target=claude,opencode,gemini       # 여러 타겟 명시
node install.js --dry-run                             # 쓰기 없이 미리보기
```

복사 위치:

| 타겟 | 쓰는 경로 | 슬래시 |
|---|---|---|
| `claude` | `~/.claude/skills/weave-*/SKILL.md` | `/weave:<name>` |
| `opencode` | `~/.config/opencode/command/weave-*.md` | `/weave-<name>` |
| `gemini` | `~/.gemini/commands/weave/*.toml` | `/weave:<name>` |

런타임은 `~/.weave/bin/` (`$WEAVE_HOME` 로 오버라이드 가능).

**Copilot CLI — claude 타겟에 포함.** Copilot 이 시작 시 `~/.claude/skills/` 를 스캔하도록 설계돼 있어, `--target=claude` 설치 하나로 동일한 13개 커맨드가 Copilot CLI 에도 `/weave-<name>` 형태로 노출된다. `--target=copilot` 플래그는 **없다** — 중복이기 때문.

타겟은 `~/.claude/` · `~/.config/opencode/` · `~/.gemini/` 존재 여부로 자동 감지. 하나도 없으면 Claude Code 로 fallback. Codex CLI 는 read-only 어댑터(discover/detect 전용)라 `--target=codex` 는 거부된다.

### 제거

```bash
node install.js --uninstall                           # 감지된 모든 CLI + ~/.weave/bin/ 삭제
node install.js --uninstall --target=gemini           # 특정 CLI 만 (런타임 유지)
node install.js --uninstall --target=claude,opencode  # 여러 개
node install.js --uninstall --dry-run                 # 미리보기
```

타겟별 삭제 범위:

| 타겟 | 삭제 대상 |
|---|---|
| `claude` | `~/.claude/skills/weave-*/` (Copilot CLI 가 참조하는 경로와 동일 — Copilot 에서도 같이 사라진다) |
| `opencode` | `~/.config/opencode/command/weave-*.md` |
| `gemini` | `~/.gemini/commands/weave/*.toml` + 빈 `weave/` 네임스페이스 디렉터리 |

`~/.weave/workflows/` 는 **자동 삭제하지 않는다** — 전역 preset 이 들어있는 사용자 데이터. 직접 지우려면 `rm -rf ~/.weave/workflows`.

업데이트 후 재설치는 `node install.js` 재실행 — idempotent.

## 2. 핵심 개념

| 용어 | 의미 |
|---|---|
| **Skill (스킬)** | Claude 기능 단위 (예: `superpowers:brainstorming`). `~/.claude/plugins/...` 또는 `~/.claude/skills/` 아래 `SKILL.md` 파일로 존재. |
| **Preset (프리셋)** | 순서가 있는 재사용 가능한 스킬 시퀀스. `.weave/workflows/<name>.json` 에 JSON으로 저장. |
| **Session (세션)** | preset 1회 실행. 현재 step, 산출물, 메모를 추적. `<project>/.weave/session.json` 에 저장. |
| **Scope (스코프)** | preset 저장 위치: `project` (`<cwd>/.weave/workflows/`) 또는 `global` (`~/.weave/workflows/`). |
| **Step (스텝)** | preset 내 한 단계. `skillId`, `checkpoint`, `interactive`, 선택적 `requiresOutputsFrom` 포함. |
| **Checkpoint (체크포인트)** | step 완료 후 동작: `auto` (자동 진행) / `verify` (사용자 검증 요청) / `decision` (사용자 선택 요청). |
| **Artifact (산출물)** | step이 생성한 파일 (spec, plan, code). `artifact-register`로 weave에 보고. |

## 3. 커맨드 레퍼런스

지원 CLI 전부에서 슬래시 커맨드로 노출된다. Claude Code · Gemini CLI 는 `/weave:<name>` (네임스페이스 지원), opencode · Copilot CLI 는 `/weave-<name>` (평탄화).

| 커맨드 | 용도 |
|---|---|
| `/weave:compose` | 새 preset 생성. 별도 터미널 창에서 트리 선택 UI 실행. |
| `/weave:list` | 저장된 preset 목록 (project + global). |
| `/weave:run <name>` | preset step별 실행. `--auto` 붙이면 자율 모드. |
| `/weave:status` | 현재 세션 상태, 또는 compaction 이후 컨텍스트 복원. |
| `/weave:history` | 완료된 step과 산출물 조회. |
| `/weave:ref <query>` | 산출물 검색: `keyword:X`, `step:N`, `type:K`, 또는 자유 검색. |
| `/weave:note <text>` | 현재 step에 메모 추가 (이후 step wrapper에 노출). |
| `/weave:next` | 자동 advance 실패 시 수동 진행. |
| `/weave:rollback` | 현재 step을 `pending`, 이전 step을 `in_progress`로 되돌림. 파일은 건드리지 않음. |
| `/weave:debug` | 세션 + 설정 + git 상태 전체 덤프. |
| `/weave:manage` | preset 편집 / 복제 / 삭제 / 프로모트 / 디모트. |
| `/weave:edit-session` | **진행 중** 세션에서 pending 스텝 skip / 새 스킬 insert. session.json 만 수정, preset 원본은 유지. |
| `/weave:help` | 적응형 도움말 (세션 활성 시 step 수준, 아니면 커맨드 맵). |

## 4. 처음부터 끝까지 워크스루

### preset 만들기

```
/weave:compose
```

- 새 터미널 창이 뜸 (OS에 따라 Terminal.app / iTerm2 / gnome-terminal 등).
- 픽커는 **디스커버된 모든 스킬을 프로젝트 생애주기 순서의 30개 canonical phase 그룹**으로 묶어 한 화면에 표시 (Onboarding → Alignment → Discovery → Research → Requirements 3종 → Design 4종 → Planning 3종 → Test Strategy → Implementation 2종 → Code Review → QA 계열 → CI/CD → User Testing → Integration & Ship → Retrospective → Milestone Close → Evolution) + 교차횡단 밴드 3종 (Control · Docs · Progress).
- 각 그룹 내부는 방법론 우선순위 (`wds → bmad → bmad-testarch → bmad-cis → gds → gsd → superpowers`) → curated step 순서 → 알파벳 순으로 정렬.
- `Up`/`Down` 으로 네비게이션 (`PageUp`/`PageDown` 은 10행 단위 점프), `+`/`-` (또는 `Right`/`Left`) 로 phase 그룹 펼침/접음 — skill 행에서 `Left` 는 부모 템플릿으로 점프, `Space` 또는 `Enter` 로 스킬 체크 (또는 `SAVE`/`QUIT` 액션 실행), `a` 로 현재 그룹 전체 토글, `r` 로 스킬 목록 다시 읽기(캐시 무시, 플러그인 추가·삭제 후 유용), `s` 로 `SAVE` 액션에 점프, `q` 또는 `Ctrl+C` 로 저장 없이 종료.
- `SAVE` 에서 `Enter` → preset 이름 + scope 입력 (기본 `project`).
- 같은 scope 에 이름 충돌 시: `overwrite` / `rename` / `cancel` 선택.
- 창 자동 종료 → CLI 에 `✓ Saved preset X` 표시.

**로케일**. 픽커, 상태 메시지, 프롬프트, phase 설명은 `$LANG` 을 따름 — 한국어(`ko_*`) 또는 영어(기본). 로케일이 바뀌면 캐시가 자동 무효화되어 다음 실행에서 올바른 언어로 다시 렌더링됨.

### 실행

```
/weave:run my-flow
```

Claude가 세션을 시작하고 각 step을 돈다:
1. `guard`로 전제조건 검사
2. `git-snapshot`으로 상태 캡처
3. `context-bridge generate`로 현재 스킬의 SKILL.md를 weave 컨텍스트(이전 산출물·메모·도구)로 감싸서 주입
4. 스킬이 자연스럽게 실행 — Claude가 SKILL.md 지시를 따름
5. `artifact-register`로 생성 파일 기록
6. `advance`로 다음 step 이동
7. 끝까지 반복 → `end`로 세션 아카이브

### 실행 중 유용한 것들

| 원하는 것 | 커맨드 |
|---|---|
| 진행 상황 확인 | `/weave:status` |
| 지금까지 산출물 보기 | `/weave:history` 또는 `/weave:ref keyword:api` |
| 나중 step을 위한 메모 | `/weave:note 인증 미들웨어 고려` |
| 멈췄을 때 강제 진행 | `/weave:next` |
| 직전 step 되돌리기 | `/weave:rollback` |
| 남은 스텝 skip / 새 스킬 insert | `/weave:edit-session` |
| 내부 상태 검사 | `/weave:debug` |

### 자율 모드

```
/weave:run my-flow --auto
```

`checkpoint=auto` 이고 `interactive=false`인 스킬은 사용자 응답 없이 자동 진행. `verify`/`decision` 체크포인트와 interactive 스킬은 여전히 멈춤.

## 5. Scope — project vs global

**Project** (`<cwd>/.weave/workflows/`)
- 코드베이스와 함께 있음; 팀과 공유하려면 커밋.
- `compose`의 기본 scope.
- `run` 시 우선 탐색됨.

**Global** (`~/.weave/workflows/`)
- 모든 프로젝트에서 공유.
- 개인 레시피용 (TDD 루프, 코드리뷰 루프 등).
- 같은 이름이 project에 없을 때 폴백.

이름 충돌 시 project 우선. `/weave:list`로 scope 배지와 함께 확인 가능. `/weave:manage`로 promote (project → global) / demote (global → project) 가능.

## 6. Context compaction & 세션 복구

Weave 세션 상태는 `.weave/session.json`에 저장 → 디스크에 있으니 compaction에 영향 없음.

Compaction 이후:
```
/weave:status
```
Claude가 `runtime restore`를 호출하고 현재 step의 wrapper를 재생성. 중단점부터 이어감.

크래시 / 새 터미널 이후: 동일. `/weave:status`가 자동 복구. `.lock`이 stale이면 (크래시된 프로세스) 다음 `runtime start`가 30초 후 재획득. 강제로 제거: `rm <project>/.weave/.lock`.

## 7. CLI (스크립팅용)

모든 커맨드는 `~/.weave/bin/cli.js`를 거침:

```bash
node ~/.weave/bin/cli.js help
node ~/.weave/bin/cli.js discover --workflow-only

# storage
node ~/.weave/bin/cli.js storage list-scopes
node ~/.weave/bin/cli.js storage save my-flow '<json>' [--scope=project|global]
node ~/.weave/bin/cli.js storage load my-flow [--scope=project|global]
node ~/.weave/bin/cli.js storage remove my-flow [--scope=project|global]
node ~/.weave/bin/cli.js storage clone <from> <to> [--from-scope=..] [--to-scope=..]

# runtime — 총 18개 서브커맨드 (status + 그 외 17개)
node ~/.weave/bin/cli.js runtime status
# 그 외: start, end, advance, rollback, artifact-register, git-snapshot,
#         history, debug, ref, note, restore, check-update, is-git-repo,
#         session-outline, find-skill, insert-step, skip-step

# step (/weave:run 내부에서 사용)
node ~/.weave/bin/cli.js step prepare [--auto]            # guard + git-snapshot + wrapper
node ~/.weave/bin/cli.js step finish '<artifacts-json>'   # register + advance + next wrapper

# context-bridge / guard (저수준 헬퍼)
node ~/.weave/bin/cli.js context-bridge generate [stepIndex] [--auto]
node ~/.weave/bin/cli.js guard <stepIndex> <sessionJsonPath>

# compose (새 터미널 창에서 열기 / 단일 픽)
node ~/.weave/bin/cli.js compose-spawn
node ~/.weave/bin/cli.js compose-pick [--session-checked=id1,id2,...]   # /weave:edit-session 의 single-pick
```

표준 사용법 문자열: `node ~/.weave/bin/cli.js help`.

## 8. Preset JSON 구조

```json
{
  "schemaVersion": 1,
  "name": "my-flow",
  "created": "2026-04-17T...",
  "updated": "2026-04-17T...",
  "steps": [
    {
      "order": 1,
      "skillId": "superpowers:brainstorming",
      "checkpoint": "auto",
      "interactive": true
    },
    {
      "order": 2,
      "skillId": "superpowers:writing-plans",
      "checkpoint": "auto",
      "interactive": true,
      "requiresOutputsFrom": [0]
    }
  ],
  "tools": ["gsd:debug"]
}
```

직접 수정하거나 `/weave:manage`로 편집.

## 9. 문제 해결

| 증상 | 해결 |
|---|---|
| `/weave:compose` "Weave not installed" | weave 리포에서 `node install.js` 실행. |
| 컴포즈 터미널이 안 뜸 (macOS) | macOS "자동화" 권한 요청 — 시스템 설정 → 개인 정보 보호 및 보안에서 한 번 허용. |
| 컴포즈 터미널이 안 뜸 (Linux) | gnome-terminal / konsole / alacritty / kitty / xterm 중 하나 설치. |
| "Preset not found: X" | scope나 이름이 틀림. `/weave:list`로 전체 확인. |
| "Another weave session is running" | Stale lock. 30초 대기 후 자동 재획득, 또는 `<project>/.weave/.lock` 삭제. |
| Step이 멈추고 자동 advance 안 함 | `/weave:next`에 파일 목록 제공, 또는 `/weave:debug`로 내부 상태 점검. |
| 출력이 틀려서 다시 하고 싶음 | `/weave:rollback` 후 step 재실행. **디스크의 파일은 되돌려지지 않음** — 필요하면 git 사용. |

## 10. 파일 위치

```
~/.weave/
├── bin/                   ← 런타임 (cli.js + core/ + demo/)
├── workflows/             ← 전역 preset
└── cache/                 ← 내부 마커

~/.claude/skills/
└── weave-*/SKILL.md       ← 13개 슬래시 커맨드 스킬

<project>/.weave/
├── session.json           ← 현재 세션 상태
├── .lock                  ← 세션 락 (30초 stale 후 자동 재획득)
├── workflows/             ← 프로젝트 로컬 preset
└── archive/               ← 완료된 세션
```

## 11. Stage 분류 체계 (compose 그룹 기준)

Weave 의 discover 레이어는 모든 에이전틱 워크플로우 스킬을 **30개 canonical stage** 중 하나로 분류한다. compose 픽커의 그룹 축과 `discoverAll` 결과의 정렬 기준.

**메인 흐름 (project-time, 27개)**
Onboarding · Alignment · Discovery · Research · Requirements — Mapping · Requirements — Spec · Requirements — Validation · Design — UX · Design — Architecture · Design — Narrative/Content · Design — Asset Spec · Planning — Epics · Planning — Stories · Planning — Sprint · Test Strategy · Implementation — Dev · Implementation — Assets · Code Review · Test — Automation · QA — NFR · QA — Review/Trace · CI/CD · User Testing · Integration & Ship · Retrospective · Milestone Close · Evolution

**교차횡단 밴드 (3개)**
Control · Docs · Progress

분류 파이프라인: `processStage` frontmatter → `OVERRIDE_TABLE` → `STAGE_KEYWORDS` → `'Other'`.

## 12. 뱃지 레퍼런스

compose UI는 각 스킬 옆에 2–3글자 뱃지를 표시함: `Q|I`, `W|M|I` 등. 전체 설명: [badges.ko.md](badges.ko.md) / [badges.md](badges.md).

