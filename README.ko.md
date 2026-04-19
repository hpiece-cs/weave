# Weave

> English: [README.md](README.md)

**에이전트 코딩 CLI 용 워크플로우 컴포저** — Claude Code, opencode, Gemini CLI, Copilot CLI 지원. 설치된 CLI 의 플러그인·익스텐션에서 스킬을 자동 디스커버해 **재사용 가능한 preset**으로 엮고 step-by-step 실행을 오케스트레이션한다. 세션 상태를 파일시스템에 저장하기 때문에 컨텍스트 compaction·rollback·세션 간 재개가 가능하다.

- **리포:** [github.com/hpiece-cs/weave](https://github.com/hpiece-cs/weave)
- **지원 CLI:** Claude Code, opencode, Gemini CLI, Copilot CLI
  - 직접 설치 타겟(`--target=...`): `claude`, `opencode`, `gemini`
  - Copilot CLI 는 `~/.claude/skills/` 를 읽도록 설계됐기 때문에 `--target=claude` (또는 기본 설치) 만으로 자동으로 노출된다 — 별도 플래그 없음.
- **Node:** 18+

---

## 왜 Weave 인가

에이전트 코딩 생태계에는 이미 **여러 결이 다른 에이전트 워크플로우**가 공존한다 — superpowers, GSD, BMAD, WDS, GDS, 그리고 계속 늘어나는 커스텀 스킬들. 문제는 이들 각각이 **장단점의 묶음**이라는 점이다. 어느 하나도 완벽하지 않고, 어느 하나도 쓸모가 없지 않다.

현실의 프로젝트는 이 중 **어느 하나로도 끝나지 않는다.** 그럼에도 대부분의 도구는 "한 방법론만 쓰세요" 를 전제로 한다. 그 결과 모두가 암묵적으로 여러 방법론을 섞어 쓰면서도, 그 조합을 **재현·공유·감사할 방법이 없다.**

Weave 의 핵심 가치는 바로 여기다 — **방법론의 경계를 넘나드는 "나만의 하이브리드 워크플로우"를 설계·고정·재사용할 수 있게 만든다.**

### 하이브리드 워크플로우의 강점

- **각 방법론의 best 단계만 뽑아 쓸 수 있다.** 한 방법론의 강점 단계와 다른 방법론의 강점 단계를 자유롭게 섞는다 — 한 preset 안에서.
- **방법론의 약점을 다른 방법론으로 메운다.** 한 방법론이 얕게 다루는 단계는 그 단계에 강한 다른 방법론의 스킬로 대체·보강한다.
- **Weave 가 정의한 공통 생애주기 위에 정렬된다.** Onboarding → Retrospective 까지 Weave 가 정의한 canonical phase 로 표준화돼 있어, 방법론이 다른 스킬도 "같은 단계에 꽂히는 대안들"로 보인다 — 이음매가 보이고, 교체가 쉬워진다.
- **내 조합을 박제한다.** 특정 프로젝트에서 증명된 순서를 JSON preset 으로 고정해, 같은 리포의 다음 기능, 다른 팀원, 다음 분기에도 같은 품질로 재현된다.
- **프로젝트마다 다른 조합을 유지할 수 있다.** 프런트엔드 리포·백엔드 서비스·게임 프로토타입 등, 도메인에 맞는 방법론 조합을 `project` scope 에 담아 각 리포가 자기만의 플로우를 갖는다.
- **실험과 진화가 싸다.** 새 스킬·새 방법론이 나오면 preset 한 step 만 교체하면 끝. 전체 프로세스를 갈아엎을 필요가 없다.

### 강점 요약

| | 설명 |
|---|---|
| **스킬 디스커버리 통합** | 설치된 모든 플러그인의 스킬을 한 곳에서 탐색. 방법론 경계가 허물어짐. |
| **Weave 공통 생애주기 분류** | Weave 가 정의한 canonical phase 체계 위에 모든 스킬을 정렬 — 서로 다른 방법론의 스킬이 **같은 단계의 대안**으로 보인다. 믹스매치의 출발점. |
| **재사용 가능한 preset** | 검증된 하이브리드 플로우를 JSON 으로 박제. `/weave:compose` 한 번, 이후 `/weave:run` 만. |
| **컨텍스트 생존성** | 세션 상태가 디스크에 있음 → compaction · crash · 새 터미널 이후에도 `/weave:status` 로 복원. |
| **팀 공유 vs 개인 루틴 분리** | `project` scope 는 커밋해서 팀과, `global` scope 는 개인 레시피로. 프로젝트마다 다른 조합 가능. |
| **자율 × 안전 균형** | `checkpoint=auto/verify/decision` 로 "어디서 사람이 붙을지"가 preset 에 명시됨. |
| **되돌릴 수 있는 실행** | `/weave:rollback` 으로 step 단위 재실행. 파일은 git, 실행은 weave. |

### 이걸로 열리는 것들

- **"내 방법론" 을 만들 수 있다.** 여러 방법론의 강점 단계를 골라 엮은 조합 = **당신만의 워크플로우**. 한 방법론에 종속되지 않는다.
- **팀의 합의된 하이브리드를 코드로 관리한다.** 구두로 전해지던 "우리 팀은 이렇게 일합니다" 가 리포에 커밋된 preset 이 된다.
- **프로젝트 유형별 최적 조합.** 프런트엔드·백엔드·게임·리서치 리포마다 다른 preset 을 둬서, 컨텍스트 스위치 비용을 줄인다.
- **장기 작업의 지속성.** 며칠·몇 세션에 걸친 마이그레이션이나 대형 리팩터도 하이브리드 preset 으로 설계해 중단점에서 재개한다.
- **감사 가능한 하이브리드 실행.** `archive/` 에 "어느 방법론의 어느 스킬이 언제 무슨 산출물을 냈는지" 가 그대로 남는다.
- **방법론 A/B 테스트.** 같은 단계에 대안 preset 을 만들어 두 번 돌려보고, 더 잘 맞는 쪽을 고른다 — 방법론을 "선택" 하던 것에서 "측정" 하는 것으로 바꾼다.

---

## 동작 원리

Weave 의 설계 철학은 한 줄로 요약된다 — **"에이전트가 실행하고, Weave 는 상태를 책임진다."** 스킬 자체는 건드리지 않는다. Weave 는 그 주변을 감싸는 얇은 오케스트레이션 레이어일 뿐이다.

### 네 가지 동작 단계

사용자가 경험하는 Weave 의 전체 흐름은 네 단계로 이루어진다.

**1. Discover — 설치된 스킬을 한 지도 위에 정렬**

플러그인을 설치하면 Weave 가 모든 `SKILL.md` 를 스캔해서 각 스킬이 어느 단계에 속하는지 판별한다. 서로 다른 방법론의 스킬이 **Weave 가 정의한 공통 생애주기** 위에 같은 단계의 대안으로 나란히 배치된다 — 하이브리드 워크플로우의 출발점이다.

**2. Compose — 트리에서 골라 preset 으로 고정**

`/weave:compose` 는 새 터미널 창에 트리 픽커를 띄운다. 사용자는 단계별로 펼쳐진 스킬 목록에서 필요한 것을 체크하고, 이름과 scope(project 또는 global) 를 붙여 저장한다. 결과는 JSON 파일 하나 — 읽을 수 있고, 커밋할 수 있고, 편집할 수 있다.

**3. Run — step 단위로 실행되는 사이클**

`/weave:run <name>` 을 치면 preset 이 한 step 씩 돌아간다. 각 step 마다 Weave 는 같은 사이클을 반복한다:

- **전제조건 검사** — git 상태, 필요한 도구, 중복 실행 락 등.
- **컨텍스트 주입** — 이전 step 들의 산출물·사용자 메모·가용 도구를 현재 스킬 지시문과 합쳐서 에이전트에게 전달.
- **스킬 실행** — 에이전트가 합쳐진 지시를 자연스럽게 수행. Weave 는 이 구간에서 개입하지 않음.
- **산출물 기록** — 생성된 파일을 step 에 귀속시켜 이후 단계와 검색에서 찾을 수 있게 함.
- **체크포인트 판정** — 자율 진행 / 사용자 검증 / 사용자 선택 중 하나로 다음 행동 결정.
- **다음 step 으로 이동** — 또는 끝에 도달하면 세션을 아카이브.

이 사이클의 핵심은 **"각 step 이 이전 step 의 결과를 안다"** 는 점이다. 독립 실행되는 스킬을 모아둔 리스트가 아니라, 산출물이 다음 단계의 입력으로 이어지는 연결된 흐름이다.

**4. Recover — 언제든 멈추고 이어가기**

세션 상태는 전부 디스크의 JSON 파일에 저장된다. 그래서:

- **컨텍스트 한도에 걸려도 상관없다** — `/weave:status` 한 번이면 직전 step 의 맥락을 재구성해 이어간다.
- **새 터미널·재부팅 이후에도 이어간다** — 프로젝트 디렉터리에서 상태를 그대로 읽어낸다.
- **잘못된 단계를 되돌릴 수 있다** — `/weave:rollback` 이 step 포인터만 되돌린다. 디스크의 파일은 git 이 담당.

### 두 개의 레이어

Weave 의 구성을 사용자 관점에서 단순화하면 이렇다:

- **위 — 지시서 레이어.** 슬래시 커맨드(`/weave:compose`, `/weave:run`, …) 로 노출되는 스킬 13개. 에이전트가 읽고 실행한다.
- **아래 — 상태 레이어.** preset, 세션, 산출물, 락. 전부 파일이고, 전부 사람이 읽을 수 있다.

이 분리 덕분에 Weave 는 특정 에이전트 구현에 묶이지 않고, 모델 · CLI · 버전 업그레이드에 영향을 거의 받지 않는다.

### 자율 실행과 사용자 개입의 균형

preset 의 각 step 에는 두 개의 플래그가 달려 있다.

- **체크포인트** — 자율 진행 / 사용자 검증 / 사용자 선택 중 하나.
- **대화형 여부** — 스킬 자체가 사용자 입력을 요구하는지.

`--auto` 로 실행하면 자율 진행이면서 비대화형인 step 만 건너뛴다. 나머지 단계에서는 언제나 멈춘다 — **자율이 안전과 거래되지 않는다.** "어디서 내가 붙어야 하는가" 가 preset 에 이미 새겨져 있는 셈이다.

### 한 문장 요약

설치된 모든 스킬을 **단계 단위**로 보고, 필요한 조합을 **파일로 고정** 하고, 실행 상태를 **디스크에 남긴** 채 step 씩 돌린다 — 그게 Weave 의 전부다.

---

## 설치

사전 준비: **Node 18+** 과 `git`.

### 1. 저장소 클론

```bash
git clone https://github.com/hpiece-cs/weave.git
cd weave
```

### 2. 설치 스크립트 실행

```bash
node install.js                           # 구성된 모든 CLI 자동 감지
node install.js --target=claude           # Claude Code 만
node install.js --target=claude,opencode  # 여러 타겟 동시 설치
node install.js --dry-run                 # 쓰기 없이 미리보기
```

복사 위치:

- 런타임 → `~/.weave/bin/` (`$WEAVE_HOME` 로 오버라이드 가능)
- 타겟별 스킬:
  - `--target=claude` → `~/.claude/skills/weave-*/SKILL.md` → `/weave:*` (13개)
  - `--target=opencode` → `~/.config/opencode/command/weave-*.md` → `/weave-*` (13개)
  - `--target=gemini` → `~/.gemini/commands/weave/*.toml` → `/weave:*` (13개)

Copilot CLI 는 **claude 타겟에 포함된다**: Copilot 이 설계상 `~/.claude/skills/` 를 스캔하기 때문에 `--target=claude` 설치로 13개 weave 커맨드가 Copilot CLI 에도 `/weave-*` 형태로 그대로 노출된다. 별도의 Copilot 플래그는 없다.

`--target` 생략 시 `~/.claude/` · `~/.gemini/` · `~/.config/opencode/` 를 감지해 존재하는 CLI 전부에 설치 (하나도 없으면 Claude Code 로 fallback).

설치는 idempotent — 다시 실행해도 안전.

### 3. 확인

CLI 에서 `/weave` 를 입력하면 슬래시 커맨드 13개가 뜬다.

- Claude Code · Gemini CLI → `/weave:<name>` (네임스페이스 지원)
- opencode · Copilot CLI → `/weave-<name>` (하이픈 — 네임스페이스를 평평하게 편다)

### 업데이트

```bash
cd weave
git pull
node install.js
```

### 제거

```bash
node install.js --uninstall                           # 감지된 모든 타겟 + 런타임 제거
node install.js --uninstall --target=gemini           # 특정 CLI 만 제거 (런타임은 유지)
node install.js --uninstall --target=claude,opencode  # 여러 CLI 동시 제거
node install.js --uninstall --dry-run                 # 실제 삭제 없이 미리보기
```

삭제 범위:

- `--target=claude` → `~/.claude/skills/weave-*/` (Copilot CLI 가 참조하던 경로와 동일 — 같이 사라진다)
- `--target=opencode` → `~/.config/opencode/command/weave-*.md`
- `--target=gemini` → `~/.gemini/commands/weave/*.toml` (비워지면 `weave/` 네임스페이스 디렉터리도 제거)
- `--target` 미지정 → 위 CLI 전부 **+** `~/.weave/bin/` (런타임)

`~/.weave/workflows/` 는 **자동으로 지우지 않는다** — 전역 workflow preset 이 들어있는 사용자 데이터이기 때문. 필요 없으면 직접 삭제:

```bash
rm -rf ~/.weave/workflows
```

리포가 이미 없다면 수동 one-liner 로도 가능:

```bash
rm -rf ~/.weave ~/.claude/skills/weave-* ~/.gemini/commands/weave ~/.config/opencode/command/weave-*.md
```

## 빠른 시작

1. **preset 생성** — 새 터미널 창에서 트리 UI로 스킬 고르기:
   ```
   /weave:compose
   ```
2. **실행**:
   ```
   /weave:run my-flow
   ```
   `--auto`를 붙이면 자율 모드 (`checkpoint=auto` step 자동 진행).
3. **진행 상황 확인 / compaction 이후 복원**:
   ```
   /weave:status
   ```

## 슬래시 커맨드

지원 CLI 전부에 노출된다. Claude Code · Gemini CLI 는 `/weave:*`, opencode · Copilot CLI 는 `/weave-*`.

| 커맨드 | 용도 |
|---|---|
| `/weave:compose` | 새 preset 생성 (트리 픽커 UI). |
| `/weave:list` | 저장된 preset 목록 (project + global). |
| `/weave:run <name>` | preset step별 실행. `--auto`로 자율 모드. |
| `/weave:status` | 현재 세션 상태 / compaction 후 컨텍스트 복원. |
| `/weave:history` | 완료된 step과 산출물. |
| `/weave:ref <query>` | 산출물 검색 (`keyword:`, `step:`, `type:`). |
| `/weave:note <text>` | 현재 step에 메모 추가. |
| `/weave:next` | 자동 advance가 멈췄을 때 수동 진행. |
| `/weave:rollback` | 이전 step으로 되돌림 (파일은 건드리지 않음). |
| `/weave:debug` | 세션 + 설정 + git 상태 덤프. |
| `/weave:manage` | preset 편집 / 복제 / 삭제 / 프로모트 / 디모트. |
| `/weave:edit-session` | **진행 중** 세션의 스텝 skip / 새 스킬 insert (세션만 수정, preset 원본은 유지). |
| `/weave:help` | 상황 적응형 도움말. |

## 파일 위치

```
~/.weave/
├── bin/                    ← 런타임 (cli.js + core/)
├── workflows/              ← 전역 preset
└── cache/                  ← 내부 마커

~/.claude/skills/
└── weave-*/SKILL.md        ← 슬래시 커맨드 스킬 13개

<project>/.weave/
├── session.json            ← 현재 세션 상태
├── .lock                   ← 세션 락 (30초 후 stale 자동 재획득)
├── workflows/              ← 프로젝트 로컬 preset
└── archive/                ← 완료된 세션
```

## Scope — project vs global

- **Project** (`<cwd>/.weave/workflows/`) — 코드베이스와 함께 있음. 팀과 공유하려면 커밋. `compose`의 기본 scope. 이름 충돌 시 우선.
- **Global** (`~/.weave/workflows/`) — 모든 프로젝트에서 공유. 개인 레시피용 (TDD 루프, 리뷰 루프 등).

`/weave:manage`로 promote (project → global) / demote (global → project) 가능.

## CLI (스크립팅용)

모든 슬래시 커맨드는 `~/.weave/bin/cli.js`를 거침. 스크립트에서는 직접 호출:

```bash
node ~/.weave/bin/cli.js help
node ~/.weave/bin/cli.js discover --workflow-only
node ~/.weave/bin/cli.js storage list-scopes
node ~/.weave/bin/cli.js runtime status
```

## 문서

- [**사용자 매뉴얼**](docs/MANUAL.ko.md) — 전체 커맨드 레퍼런스, 워크스루, 트러블슈팅.

## 라이선스

MIT
