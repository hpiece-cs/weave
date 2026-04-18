# Agentic Workflow Skills by Methodology

방법론별로 분류된 agentic workflow 스킬 목록입니다. 홈 디렉토리(`~/.claude/skills/`)와 프로젝트 폴더(`/Users/Work/git/claude/skills/weave/skills/`)의 스킬들을 정리했습니다.

**생성 일시**: 2026-04-18  
**총 스킬 수**: 128개 (홈) + 12개 (프로젝트) = 140개

---

## 📊 방법론별 스킬 통계

| 방법론 | 프리픽스 | 홈 디렉토리 수 | 프로젝트 소스 | 합계 | 설명 |
|--------|---------|-------------|-----------|------|------|
| **BMAD Core** | `bmad-` | 49 | - | 49 | 비즈니스 민첩 개발 방법론 핵심 스킬 |
| **BMAD-CIS** | `bmad-cis-` | 10 | - | 10 | 창의 지능 스위트 (Creative Intelligence Suite) |
| **BMAD-TEA** | `bmad-testarch-`, `bmad-tea` | 9 | - | 9 | 테스트 아키텍처 엔터프라이즈 (Test Architecture Enterprise) |
| **GDS** | `gds-` | 35 | - | 35 | 게임 디자인 스튜디오 (Game Design Studio) |
| **WDS** | `wds-` | 12 | - | 12 | 웹 디자인 스튜디오 (Web Design Studio) |
| **Weave** | `weave-` | 12 | ✓ 12 | 12 | 워크플로우 오케스트레이션 |
| **기타** | - | 1 | - | 1 | `agent-settings` |
| | | | | **128** | |

---

## 📁 방법론별 상세 목록

### 1️⃣ BMAD Core (49개)

BMAD (Business Methodology for Agile Development) 핵심 스킬입니다. 분석, 계획, 아키텍처, 구현, 검수의 전체 소프트웨어 개발 주기를 다룹니다.

<details>
<summary>BMAD Core 스킬 목록 (49개) - 펼치기</summary>

1. bmad-advanced-elicitation
2. bmad-agent-analyst
3. bmad-agent-architect
4. bmad-agent-builder
5. bmad-agent-dev
6. bmad-agent-pm
7. bmad-agent-qa
8. bmad-agent-quick-flow-solo-dev
9. bmad-agent-sm
10. bmad-agent-tech-writer
11. bmad-agent-ux-designer
12. bmad-bmb-setup
13. bmad-brainstorming
14. bmad-check-implementation-readiness
15. bmad-code-review
16. bmad-correct-course
17. bmad-create-architecture
18. bmad-create-epics-and-stories
19. bmad-create-prd
20. bmad-create-story
21. bmad-create-ux-design
22. bmad-dev-story
23. bmad-distillator
24. bmad-document-project
25. bmad-domain-research
26. bmad-edit-prd
27. bmad-editorial-review-prose
28. bmad-editorial-review-structure
29. bmad-generate-project-context
30. bmad-help
31. bmad-index-docs
32. bmad-init
33. bmad-market-research
34. bmad-module-builder
35. bmad-party-mode
36. bmad-product-brief
37. bmad-qa-generate-e2e-tests
38. bmad-quick-dev
39. bmad-retrospective
40. bmad-review-adversarial-general
41. bmad-review-edge-case-hunter
42. bmad-shard-doc
43. bmad-sprint-planning
44. bmad-sprint-status
45. bmad-teach-me-testing
46. bmad-technical-research
47. bmad-validate-prd
48. bmad-workflow-builder

</details>

---

### 2️⃣ BMAD-CIS (10개)

**Creative Intelligence Suite** - 창의적 문제 해결, 디자인 사고, 혁신 전략을 위한 전문화된 스킬입니다.

<details>
<summary>BMAD-CIS 스킬 목록 (10개) - 펼치기</summary>

1. bmad-cis-agent-brainstorming-coach
2. bmad-cis-agent-creative-problem-solver
3. bmad-cis-agent-design-thinking-coach
4. bmad-cis-agent-innovation-strategist
5. bmad-cis-agent-presentation-master
6. bmad-cis-agent-storyteller
7. bmad-cis-design-thinking
8. bmad-cis-innovation-strategy
9. bmad-cis-problem-solving
10. bmad-cis-storytelling

</details>

---

### 3️⃣ BMAD-TEA (9개)

**Test Architecture Enterprise** - 엔터프라이즈 수준의 테스트 아키텍처, ATDD, CI/CD 통합을 위한 스킬입니다.

<details>
<summary>BMAD-TEA 스킬 목록 (9개) - 펼치기</summary>

1. bmad-tea
2. bmad-testarch-atdd
3. bmad-testarch-automate
4. bmad-testarch-ci
5. bmad-testarch-framework
6. bmad-testarch-nfr
7. bmad-testarch-test-design
8. bmad-testarch-test-review
9. bmad-testarch-trace

</details>

---

### 4️⃣ GDS (35개)

**Game Design Studio** - BMAD 방법론을 게임 개발에 맞춘 전문화된 스킬입니다. 게임 디자인, 개발, QA, 아키텍처를 다룹니다.

<details>
<summary>GDS 스킬 목록 (35개) - 펼치기</summary>

1. gds-agent-game-architect
2. gds-agent-game-designer
3. gds-agent-game-dev
4. gds-agent-game-qa
5. gds-agent-game-scrum-master
6. gds-agent-game-solo-dev
7. gds-agent-tech-writer
8. gds-brainstorm-game
9. gds-check-implementation-readiness
10. gds-code-review
11. gds-correct-course
12. gds-create-epics-and-stories
13. gds-create-game-brief
14. gds-create-gdd
15. gds-create-narrative
16. gds-create-story
17. gds-create-ux-design
18. gds-dev-story
19. gds-document-project
20. gds-domain-research
21. gds-e2e-scaffold
22. gds-game-architecture
23. gds-generate-project-context
24. gds-performance-test
25. gds-playtest-plan
26. gds-quick-dev
27. gds-quick-dev-new-preview
28. gds-quick-spec
29. gds-retrospective
30. gds-sprint-planning
31. gds-sprint-status
32. gds-test-automate
33. gds-test-design
34. gds-test-framework
35. gds-test-review

</details>

---

### 5️⃣ WDS (12개)

**Web Design Studio** - 웹 프로젝트를 위한 순차적 8단계 방법론입니다. 0단계(셋업)부터 8단계(진화)까지의 구조화된 워크플로우를 제공합니다.

<details>
<summary>WDS 스킬 목록 (12개) - 펼치기</summary>

1. wds-0-alignment-signoff
2. wds-0-project-setup
3. wds-1-project-brief
4. wds-2-trigger-mapping
5. wds-3-scenarios
6. wds-4-ux-design
7. wds-5-agentic-development
8. wds-6-asset-generation
9. wds-7-design-system
10. wds-8-product-evolution
11. wds-agent-freya-ux
12. wds-agent-saga-analyst

</details>

---

### 6️⃣ Weave (12개)

**Workflow Orchestration** - 세션 및 워크플로우 관리 계층입니다. 스킬을 구성하고, 실행하고, 추적할 수 있게 합니다.

**홈 디렉토리** (`~/.claude/skills/weave-*/`):

1. weave-compose
2. weave-debug
3. weave-help
4. weave-history
5. weave-list
6. weave-manage
7. weave-next
8. weave-note
9. weave-ref
10. weave-rollback
11. weave-run
12. weave-status

**프로젝트 소스** (`/Users/Work/git/claude/skills/weave/skills/*/SKILL.md`):

```
/Users/Work/git/claude/skills/weave/skills/compose/
/Users/Work/git/claude/skills/weave/skills/debug/
/Users/Work/git/claude/skills/weave/skills/help/
/Users/Work/git/claude/skills/weave/skills/history/
/Users/Work/git/claude/skills/weave/skills/list/
/Users/Work/git/claude/skills/weave/skills/manage/
/Users/Work/git/claude/skills/weave/skills/next/
/Users/Work/git/claude/skills/weave/skills/note/
/Users/Work/git/claude/skills/weave/skills/ref/
/Users/Work/git/claude/skills/weave/skills/rollback/
/Users/Work/git/claude/skills/weave/skills/run/
/Users/Work/git/claude/skills/weave/skills/status/
```

---

### 7️⃣ 기타 (1개)

- `agent-settings` - Claude Code 에이전트 설정 관리

---

## 📂 디렉토리 구조

### 홈 디렉토리 (설치된 스킬)

```
~/.claude/skills/
├── bmad-*/                  (49개)
├── bmad-cis-*/              (10개)
├── bmad-testarch-*/         (8개)
├── bmad-tea                 (1개)
├── gds-*/                   (35개)
├── wds-*/                   (12개)
├── weave-*/                 (12개)
└── agent-settings/          (1개)
```

### 프로젝트 폴더 (Weave 소스)

```
/Users/Work/git/claude/skills/weave/
├── skills/
│   ├── compose/
│   ├── debug/
│   ├── help/
│   ├── history/
│   ├── list/
│   ├── manage/
│   ├── next/
│   ├── note/
│   ├── ref/
│   ├── rollback/
│   ├── run/
│   └── status/
└── docs/
    ├── skill-catalog.json
    ├── skill-catalog.csv
    ├── SKILLS-CLASSIFICATION.md
    ├── SKILLS-SUMMARY-TABLE.md
    └── agentic-workflow-skills.md
```

---

## 🔍 방법론별 특징

| 방법론 | 주요 특징 | 대상 | 주요 역할 |
|--------|---------|------|---------|
| **BMAD** | 완전한 SDLC 제공, 분석→계획→구현→검수 | 소프트웨어 개발팀 | Product Manager, Architect, Developer, QA |
| **BMAD-CIS** | 창의성과 전략적 사고 중심 | 창의적 문제 해결 필요 | 디자인 씽킹 코치, 혁신 전략가 |
| **BMAD-TEA** | 테스트 아키텍처 특화 | 품질 관리팀 | QA Architect, Test Engineer |
| **GDS** | 게임 개발 전문화 | 게임 개발 스튜디오 | Game Developer, Designer, QA |
| **WDS** | 웹 프로젝트 순차적 단계 | 웹 디자인/개발팀 | UX Designer, Web Developer |
| **Weave** | 워크플로우 오케스트레이션 | 모든 팀 (메타계층) | 세션 관리, 스킬 구성 |

---

## 📈 통계 요약

- **총 아젠틱 워크플로우 스킬**: 128개 (설치됨)
- **평균 방법론당 스킬 수**: ~21.3개
- **가장 많은 스킬**: BMAD Core (49개, 38.3%)
- **전문 방법론**: GDS, WDS, BMAD-CIS, BMAD-TEA
- **프로젝트 소스**: Weave (12개 구현 완료)

---

**마지막 업데이트**: 2026-04-18
