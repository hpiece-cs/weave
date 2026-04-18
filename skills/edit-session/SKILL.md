---
name: weave-edit-session
description: Edit the active session in place — skip pending steps or insert new ones via an interactive picker. Touches session.json only; does not modify the preset template.
processStage: control
processOrder: 5.3
lifecycleGroup: session-recovery-diagnostics
lifecycleGroupNames:
  ko: 세션 복구 및 진단
  en: Session Recovery & Diagnostics
lifecycleOrder: 5.3
usesWhen: Modify the running session (insert/skip steps) without editing the preset template
skillNames:
  ko: 세션 편집
  en: Edit Session
domain: session-control
dataRole: session-mutator
scope: project
filePatterns:
  - input: {proj}/.weave/session.json
  - output: {proj}/.weave/session.json (steps[] modified)
mutates: true
frequency: rare-on-edit
---

# /weave:edit-session

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user wants to modify the **currently running** session — skip an unnecessary step or insert a new skill between pending steps. **Never edits the preset JSON** (global or project). Next run of the same preset will start fresh.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Subcommand dispatch

Parse the user's arguments (everything after `/weave:edit-session`):

- No args → **Outline flow** (show current steps)
- `skip <N>` → **Skip flow**
- `insert` (no skillId) → **Insert via picker flow**
- `insert <skillId> [--after=N]` → **Insert via direct ID flow**

Unknown subcommand → show the outline + usage hint.

## 1. Outline flow (no args)

```bash
node "$WEAVE_CLI" runtime session-outline
```

Returns:
```json
{
  "workflowName": "...",
  "sessionId": "...",
  "currentStep": 2,
  "totalSteps": 6,
  "steps": [
    { "index": 0, "number": 1, "skillId": "...", "status": "completed", "phase": "Discovery", "editable": false },
    ...
  ]
}
```

Render to the user as a compact table:

```
현재 세션: <workflowName>  (<currentStep+1>/<totalSteps> 진행 중)

   1. [✓] <skillId>                                (completed)
   2. [✓] <skillId>                                (completed)
   3. [▶] <skillId>                                (in_progress)   ← 수정 불가
   4. [ ] <skillId>                                (pending)
   5. [ ] <skillId>                                (pending)
   6. [⤫] <skillId>                                (skipped)

편집 가능한 스텝: 4, 5  (편집 가능 인덱스만 보여주기 — editable=true)

사용법:
   /weave:edit-session skip <N>                        (스텝 건너뛰기)
   /weave:edit-session insert                          (스킬 픽커로 삽입)
   /weave:edit-session insert <skillId> [--after=N]    (ID 직접 지정 삽입)
```

상태 아이콘: `completed=✓`, `in_progress=▶`, `pending=[ ]`, `skipped=⤫`.

## 2. Skip flow (`skip <N>`)

```bash
node "$WEAVE_CLI" runtime skip-step <N>
```

결과:

- `{ "status": "ok", "skipped": N, "skillId": "..." }` → 성공 메시지.
- `{ "status": "error", "reason": "out-of-range" | "already-completed" | "in-progress" | "already-skipped" }` → 사용자에게 해당 사유 설명 + outline 한 번 다시 보여주기.

완료 후 outline 을 다시 한번 호출해 상태 변경을 확인시켜 줌.

## 3. Insert via picker (`insert` 인자 없음)

Claude Code 의 Bash 는 TTY 가 없어 compose-workflow 를 직접 실행하면 오류가 납니다.
그래서 `compose-pick` CLI 가 **새 터미널 창** 을 띄우고, 사용자가 거기서 고르면
선택된 스킬 ID 를 돌려주는 방식으로 동작합니다. 아래 한 줄이 끝입니다 —
**사용자가 "picker" 를 요청하는 즉시 이 명령을 실행하세요.**

```bash
# 현재 세션의 스킬 ID 들을 session-checked 플래그로 전달해 "● 세션에 있음" 배지 표시
SESSION_SKILLS=$(node "$WEAVE_CLI" runtime session-outline | \
  node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); \
           process.stdout.write(j.steps.map(s=>s.skillId).join(','))")

# 새 터미널 창을 스폰 → 사용자가 고를 때까지 블록 (최대 10분)
PICK_RESULT=$(node "$WEAVE_CLI" compose-pick --session-checked="$SESSION_SKILLS")
```

`PICK_RESULT` 는 `{ "success": true, "skillId": "source:name" | null, "terminal": "..." }` 형태.

- `skillId` != null → 성공. 사용자가 스킬을 골랐음. 현재 스텝 바로 뒤에 삽입:
  ```bash
  SKILL=$(echo "$PICK_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).skillId || '')")
  node "$WEAVE_CLI" runtime insert-step "$SKILL"
  ```
- `skillId` == null → 취소. 사용자에게 "취소되었습니다" 안내 + outline 재출력.
- `success: false` → `reason` 필드로 실패 사유 표시 (예: 터미널 에뮬레이터 없음, 타임아웃).

Bash 호출에 `timeout=600000` (10분) 을 넉넉히 주세요. 사용자가 picker 창에서 스킬을 고르는 동안 현재 Turn 이 블록됩니다.

insert-step 결과 분기:

- `{ "status": "ok", "insertedAt": N, "skillId": "..." }` → "스텝 N 뒤에 삽입됨" 안내 + outline 재출력.
- `{ "status": "needs-confirm", "reason": "phase-backward", "detail": {...} }` → **아래 Phase 역주행 확인 서브플로우** 로 진행.
- `{ "status": "error", ... }` → 사유 설명.

### 삽입 위치 조정

Picker 는 "현재 스텝 바로 뒤" 만 기본. 다른 위치에 넣고 싶다고 사용자가 요청하면, outline 을 보여주고 `--after=N` 을 받아 다시 insert-step 을 호출.

### 터미널 스폰 실패 대응

- macOS: "자동화" 권한 요청 한 번 허용 필요.
- Linux: gnome-terminal / konsole / alacritty / kitty / xterm 중 하나 설치 필요.
- 실패 시 사용자에게 직접 수동 실행 경로 안내:
  `node $WEAVE_HOME/bin/demo/compose-workflow.js --single-pick --session-checked=<ids>`
  을 별도 터미널에서 돌린 뒤, 그 창의 stdout 에 찍힌 `{"skillId":"..."}` 를 복사해 `/weave:edit-session insert <skillId>` 로 수동 삽입.

## 4. Insert via direct ID (`insert <skillId> [--after=N]`)

```bash
node "$WEAVE_CLI" runtime insert-step <skillId> [--after=N]
```

결과 분기:

### 4-a. `status: "ok"` — 성공

사용자에게 삽입 결과를 알리고 outline 을 재출력.

### 4-b. `status: "error"`, `reason: "skill-not-found"`

```json
{
  "status": "error",
  "reason": "skill-not-found",
  "skillId": "superpowers:test-driven-dev",
  "suggestions": [
    { "id": "superpowers:test-driven-development", "name": "...", "phase": "Test Strategy" },
    ...
  ]
}
```

사용자에게:

> ✗ `superpowers:test-driven-dev` 을(를) 찾을 수 없습니다.
> 혹시 이거?
>   • superpowers:test-driven-development  (Test Strategy)
>   • superpowers:test-driven-design       (Design — UX)
>
> 정확한 ID 로 다시 실행하거나, `/weave:edit-session insert` (인자 없이) 로 picker 를 여세요.

제안 목록이 비어 있으면 picker 사용을 권장.

### 4-c. `status: "error"`, `reason: "invalid-position"`

위치가 범위 밖이거나 완료/진행중 스텝 앞이면 사유 설명 + outline 재출력.

### 4-d. `status: "needs-confirm"`, `reason: "phase-backward"`

```json
{
  "status": "needs-confirm",
  "reason": "phase-backward",
  "detail": {
    "targetPhase": "Discovery",
    "targetStageIndex": 3,
    "anchorPhase": "Implementation — Dev",
    "anchorStageIndex": 15,
    "afterIdx": 4
  }
}
```

사용자에게 확인 프롬프트:

> ⚠ 이 삽입은 phase 가 뒤로 가는 움직임입니다.
>   삽입하려는 스킬: `<skillId>`  (phase: `Discovery`, stage 3)
>   현재 위치 주변: `Implementation — Dev` (stage 15)
>
> 반복 루프가 의도였다면 진행하고, 아니라면 취소하세요.
>
> 계속 삽입할까요? (y/N)

사용자가 `y` 라고 답하면 동일 커맨드를 `--confirm` 플래그와 함께 재실행:

```bash
node "$WEAVE_CLI" runtime insert-step <skillId> --after=<N> --confirm
```

`N` 또는 빈 답이면 취소하고 outline 재출력.

## Notes

- **편집 대상은 오직 `<cwd>/.weave/session.json`.** 전역/프로젝트 preset JSON 은 건드리지 않음. 원본 preset 에 변경을 남기고 싶다면 `/weave:manage edit` 을 쓰라고 안내.
- 삽입된 스텝에는 `insertedAt` 타임스탬프가 붙음. 스킵된 스텝에는 `skippedAt` 이 붙음.
- `advance` 와 `rollback` 은 `skipped` 스텝을 자동으로 뛰어넘음.
- 에러 발생 시 항상 outline 을 마지막에 한번 더 보여주면 사용자가 현재 상태를 바로 파악할 수 있음.
