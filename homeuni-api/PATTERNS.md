# Lyceum — PATTERNS.md

*Per-project pattern index. Read this first when working on Lyceum.*

---

## 1. What this project is

Lyceum is a stress-free university simulator for self-directed learners who want degree-level depth without enrollment. It generates a complete personalized curriculum on demand — semesters, courses, lessons, assignments, and exams — and tutors the student through it in real time via a conversational professor agent. The entire university exists for one student and adapts as they learn.

Architecturally, Lyceum is a four-agent system (advisor, professor, assessor, curriculum) governed by a six-stage program lifecycle (`onboarding → program_design → generating → active → semester_review → graduated`). Stage transitions route to exactly one agent with no NLP classification. Curriculum is generated in three lazy tiers: skeleton first (activates the program immediately), lesson stubs second, full content on first student access with a six-rubric QA review. Difficulty is detected passively via weighted signal aggregation. All user input to LLM-facing routes passes through a three-layer security stack.

---

## 2. Load-bearing patterns

[[Two-Pass-Curriculum-Generation]] — originated here
The three-tier lazy generation strategy (skeleton → stubs → full content on demand) is the core cost and latency management mechanism; the QA pipeline runs at demand time, not generation time.

[[Passive-Difficulty-Detection]] — originated here
The weighted signal aggregator (`WEIGHT_POINTS`, 7-day rolling window, `NUDGE_THRESHOLD`, `COOLDOWN_HOURS`) drives all adaptive responses including alternative explanations and advisor nudges.

[[Lyceum-System-Architecture]] — originated here
The four-agent model and `PROGRAM_STAGES` enum are the load-bearing architectural blueprint; every routing decision in `agents.js` traces back to this document.

[[Stage-Driven-Agent-Routing]] — refined here (originated in ProjectOS)
Agent selection is a direct lookup on `program.status` with no NLP classification; the static dispatcher in `agents.js` is this pattern's second confirmed implementation.

[[Learner-Memory-Extraction]] — originated here
Turn-count-cadenced extraction of student facts (Haiku model, JSONB cap, cadence gate) drives professor personalization without per-message extraction cost.

[[Multi-Rubric-LLM-Reviewer]] — originated here
The six-rubric LLM-as-judge with PASS/REVISE/REGENERATE verdicts, one-retry cap on REGENERATE, and graceful human-review flagging governs all curriculum content quality.

[[Alternative-Explanation-on-Difficulty]] — originated here
A separate stateless LLM call triggered by the difficulty service when `nudgeType === 'different_angle'`; receives the previous explanation truncated to 500 chars as "what approach to avoid."

[[AI-Eval-Harness-Architecture]] — refined here (originated in ProjectOS)
Lyceum adapts the harness concept to content QA (generating → reviewing → flagging curriculum) rather than behavioral regression testing; the verdict-persistence and retry loop are Lyceum-specific extensions.

[[LLM-Output-Validation-with-Self-Correction]] — inherited unchanged (originated in ProjectOS)
`callClaudeJSON` in `anthropic.js` guards all structured output; retry with targeted correction message; fence-stripping applied before `JSON.parse`.

[[LLM-Security-Middleware]] — inherited unchanged (originated in ProjectOS)
`rateLimit → injectionDetection → piiAudit` applied to all five LLM-facing endpoints; per-user rate limiting keys on `req.user.id`.

---

## 3. Patterns originating or refined in this project

[[Two-Pass-Curriculum-Generation]] — originated here as the answer to the cost and latency problem of synchronous full-curriculum generation; the three-tier lazy structure with demand-time QA has no prior implementation in the portfolio.

[[Passive-Difficulty-Detection]] — originated here; the per-signal weight table, 7-day rolling window, and nudge-type selection from signal mix emerged from the specific challenge of detecting struggle without requiring explicit self-report.

[[Learner-Memory-Extraction]] — originated here; the cadence gate, model cost-tiering (Haiku for extraction), JSONB cap at 30 facts, and "never make the student feel profiled" injection constraint are decisions with no prior analogue in the portfolio.

[[Multi-Rubric-LLM-Reviewer]] — originated here in response to early curriculum generation failures; the PASS/REVISE/REGENERATE verdict system, hard one-retry cap, and graceful flagging-over-looping are Lyceum-specific contributions to [[AI-Eval-Harness-Architecture]].

[[Alternative-Explanation-on-Difficulty]] — originated here; the design decision to pass the previous explanation as a negative constraint ("what to avoid") rather than generating a fresh explanation without context is Lyceum-specific.

---

## 4. Conscious non-applications

[[Agent-Initiated-Conversations]] — not applied because the professor route responds to explicit user requests; no proactive opening message fires when a student enters a new lesson. This is a documented UX gap, not a deliberate exclusion.

[[Knowledge-Injection-for-Agents]] — not applied because Lyceum solves the same problem via [[Learner-Memory-Extraction]]: per-student JSONB memory rather than shared pgvector/tsvector retrieval from an organizational store.

[[Auto-Populating-Knowledge-Stores]] — not applied because session-end extraction writes to a per-student table, not a shared retrievable store; a cross-student knowledge loop would belong in v2.

[[AI-Product-Tier-4-Quality]] — not applied at the operational level; the QA reviewer runs at generation time only. No LLM-as-judge samples live professor or advisor conversations; no `judge_scores` table tracks interactive quality over time.

---

## 5. Anti-patterns this project is at risk for

**In-memory concurrency guards** — currently present: `generatingLessons` Set and `generatingDecks` Set are in-process guards that fail silently under multi-process deployment.

**Fire-and-forget with no failure visibility** — currently present: `learner.memory.js` extraction fails silently; no metric or alert tracks extraction failure rate.

**Integration boundary failures** — fixed during 2026-05-05 audit: AI security middleware now covers all five LLM-facing endpoints; previously only `/api/lectures` and `/api/study` were protected.

**Operational quality gap** — currently present: no LLM-as-judge sampling on live professor or advisor conversations; quality of interactive agents is not measured post-generation.

**Scattered LLM calls** — currently avoided: all Claude API calls route through the single `anthropic.js` wrapper; direct SDK use elsewhere is a code smell.

---

## 6. How to use this file

When starting work on Lyceum: read this file first, then CLAUDE.md. When the work involves a load-bearing pattern, read the wiki entry before changing the implementation. When introducing a new pattern, update this file and capture a wiki entry per the standing protocol.
