# Compose UI 뱃지 가이드

compose 트리 데모에서 각 스킬 행은 체크박스와 스킬 이름 사이에 `|`로 구분된 1글자 뱃지 하나 이상을 표시한다. 뱃지 개수와 배치는 데모에 따라 다르다:

| 데모 | 레이아웃 | 예시 |
|---|---|---|
| `demo/compose-workflow.js` (기본) | `[complexity]\|[interactive]` | `Q\|I` |
| `demo/compose-tree.js` | `[category]\|[complexity]\|[interactive]` | `W\|M\|I` |
| `demo/compose-preview.js` | 동일 필드, 배치만 다름 | `[W] Q I` |

모든 값은 `core/scripts/discover.js`가 각 SKILL.md의 description·본문 크기·내부 `Skill` 호출 수를 분석해서 **자동 추정**한다. 수동 태깅은 없음.

## 1. Complexity — 스킬 "무게"

출처: `discover.js::inferComplexity()`. 본문 총 길이 + 하위 스킬 호출 수로 판정.

| 뱃지 | 색 | 의미 | 기준 |
|---|---|---|---|
| `Q` | 청록 | **quick** — 가볍고 짧음 | 본문 < 1000자, 하위 호출 0개 |
| `M` | 노랑 | **medium** — 중간 | 본문 ≥ 1000자 OR 하위 호출 1+ |
| `F` | 빨강 | **full** — 오케스트레이터급 | 본문 ≥ 5000자 OR 하위 호출 3+ |

예시:
- `Q`: `superpowers:verification-before-completion`, `gsd:help`
- `M`: `bmad:create-prd`
- `F`: `gsd:execute-phase`, `bmad:dev-story` (여러 하위 스킬을 묶어 실행)

## 2. Interactive — 사용자 대화 필요 여부

출처: `discover.js::detectInteractive()`. description + 본문에서 `asks user`, `prompts`, `user selects/chooses/decides`, `interactive` 같은 패턴 매칭.

| 뱃지 | 색 | 의미 |
|---|---|---|
| `I` | 노랑 | **interactive** — 실행 중 사용자 응답 필요 (`--auto` 모드에서도 멈춤) |
| (공백) | — | 비대화형 — 혼자 완주 |

예시:
- `I`: `superpowers:brainstorming`, `bmad:create-prd`
- 공백: `superpowers:test-driven-development`, `gsd:execute-phase`

## 3. Category — 스킬 "성격" (tree/preview 전용)

출처: 데모 단계의 `classify()` 함수 (discover.js 외부). name + description 패턴 매칭.

| 뱃지 | 색 | 의미 | 예시 |
|---|---|---|---|
| `W` | 초록 | **workflow** — 산출물 생성 (spec/plan/code) | `bmad:create-prd`, `gsd:plan-phase` |
| `P` | 마젠타 | **persona** — 역할 스위치 (BMad agent-*, GDS agent-*) | `bmad-agent-analyst`, `gds-agent-game-dev` |
| `C` | 노랑 | **control** — 세션 흐름 제어 | `gsd:rollback`, `gsd:pause-work`, `superpowers:receiving-code-review` |
| `U` | 흐림 | **utility** — 설정/도우미, 기본 숨김 (`u`키로 토글) | `gsd:settings`, `gsd:help` |

## 뱃지가 아닌 관련 필드

UI의 다른 위치(템플릿 헤더, 상세 보기, 최근 업데이트된 스킬명 우측 `( )`)에서 표시되는 추가 메타:

| 필드 | 값 | 의미 |
|---|---|---|
| `[source]` | `superpowers`, `bmad`, `gsd`, `wds`, `gds`, `bmad-testarch`, `bmad-cis` | 소속 플러그인 |
| `phase` | Discovery, Requirements, Design, Planning, Implementation, Review/QA, Completion, Control, Other, Phase 0–8 | 워크플로우 단계 (compose-tree에서 그룹 헤더로 사용) |
| `defaultCheckpoint` | `auto`, `verify`, `decision` | 스텝 완료 후: 자동 진행 / 사용자 검증 필요 / 사용자 결정 필요 |
| `compactionAware` | true / false | 스킬이 자체적으로 컨텍스트 compaction 복구를 처리 (weave가 가벼운 restore만 주입) |
| `→outputs` | 파일 경로 배열 | discover가 SKILL.md에서 감지한 산출물 (최대 2개 표시 + `+N`) |
| `calls N` | 숫자 | 이 스킬이 호출하는 하위 스킬 수 (orchestrator 판별 지표) |

## 범례 라인

모든 compose 데모 하단에 간단한 범례가 나옴 — 헷갈리면 그 줄을 보면 됨:

```
Badges:  Q=quick  M=medium  F=full  ·  I=interactive
```

(tree/preview 데모는 `W=workflow P=persona C=control`도 추가됨.)

---

**영문 버전:** [badges.md](badges.md)
