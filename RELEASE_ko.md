# 릴리스 노트

> English: [001-release-notes-v0.1.0.md](001-release-notes-v0.1.0.md)

## v0.1.0 — 첫 공개 릴리스

**릴리스 일자:** 2026-04-19

Weave 의 첫 공개 릴리스 — 에이전트 코딩 CLI 에 설치된 스킬을 자동 디스커버해 재사용 가능한 preset 으로 엮고, 세션 상태를 디스크에 남긴 채 step 단위로 실행을 오케스트레이션하는 워크플로우 컴포저.

### 하이라이트

- **멀티 CLI 지원.** 설치 타겟: `claude`, `opencode`, `gemini`. Copilot CLI 는 `~/.claude/skills/` 를 스캔하도록 설계돼 있어 자동 노출.
- **스킬 디스커버리 통합.** 공통 생애주기 맵 위에서 서로 다른 방법론(superpowers, GSD, BMAD, WDS, GDS, …)의 스킬이 **같은 단계의 대안**으로 나란히 보인다.
- **슬래시 커맨드 13 개.** compose, run, list, status, history, ref, note, next, rollback, debug, manage, edit-session, help.
- **컨텍스트 생존성.** 세션 상태가 디스크에 있어 compaction · crash · 새 터미널 이후에도 `/weave:status` 로 현재 step 의 맥락을 복원.
- **재사용 가능한 preset.** 검증된 하이브리드 플로우를 JSON 파일 하나로 고정. project preset 은 커밋해서 팀과, global preset 은 개인 레시피로.
- **되돌릴 수 있는 실행.** `/weave:rollback` 은 step 포인터만 되돌림 (파일은 git 담당, 실행은 weave 담당).
- **자율과 안전의 균형.** `checkpoint=auto/verify/decision` + `interactive` 플래그로 "어디서 사람이 붙을지" 가 preset 에 새겨진다. `--auto` 는 **명시적으로 건너뛰어도 되는 step 만** 건너뛴다.

### 포함 내용

**런타임 (`core/`)**

- `scripts/` — `paths`, `storage`, `discover`, `guard`, `runtime`, `context-bridge`, `cli-detect`, `skill-cache`, `source-registry`, `spawn`
- `adapters/` — 설치 타겟용 어댑터 (`claude`, `gemini`, `opencode`, `codex`, `copilot`)
- `hooks/weave-statusline.js` — 선택적 상태줄 훅
- `references/guard-defaults.json` — 기본 전제조건

**슬래시 커맨드 (SKILL.md 13 개)**

| 커맨드 | 용도 |
|---|---|
| `/weave:compose` | 새 preset 생성 (새 터미널 창의 트리 픽커). |
| `/weave:list` | 저장된 preset 목록 (project + global). |
| `/weave:run <name>` | preset step 별 실행. `--auto` 로 자율 모드. |
| `/weave:status` | 현재 세션 상태 / compaction 후 복원. |
| `/weave:history` | 완료된 step 과 산출물. |
| `/weave:ref <query>` | 산출물 검색 (keyword / step / type 기준). |
| `/weave:note <text>` | 현재 step 에 메모 추가. |
| `/weave:next` | 자동 advance 가 멈췄을 때 수동 진행. |
| `/weave:rollback` | 이전 step 으로 되돌림 (파일은 건드리지 않음). |
| `/weave:debug` | 세션 + 설정 + git 상태 덤프. |
| `/weave:manage` | preset 편집 / 복제 / 삭제 / promote / demote. |
| `/weave:edit-session` | **진행 중** 세션 수정 — 대기 step skip / 새 스킬 insert. |
| `/weave:help` | 상황 적응형 도움말. |

**설치 스크립트 (`install.js`)**

- `--target` 생략 시 구성된 CLI 자동 감지, 또는 `--target=claude,opencode` 로 지정 설치.
- Idempotent — 재실행해도 안전.
- `--dry-run` 으로 쓰기 없이 미리보기.
- `--uninstall` 로 어댑터 범위 스킬 + 런타임 제거. 사용자 데이터 (`~/.weave/workflows/`) 는 **항상 보존**.

### 지원 환경

- **Node:** 18+
- **CLI:** Claude Code, opencode, Gemini CLI, Copilot CLI

### 설치

```bash
git clone https://github.com/hpiece-cs/weave.git
cd weave
node install.js
```

자세한 옵션은 [../README.ko.md](../README.ko.md) 참고.


### 라이선스

MIT
