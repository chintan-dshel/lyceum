# Lyceum — AI-Powered University

> A full university simulator built by one person with Claude. Not a chatbot wrapper. A real learning system.

Lyceum generates a personalised degree programme — complete curriculum, lectures, assignments, exams, and a professor who remembers you — from a single conversation. Every piece of content is authored by a pipeline of specialised AI agents, reviewed for quality before it reaches the student, and adapted based on how you're actually learning.

**Stack:** Node.js · React · PostgreSQL · Claude API (Haiku / Sonnet / Opus)  
**Tests:** 160 passing (unit + integration + E2E against live Claude)  
**Cost to generate a full programme:** ~$0.30–1.50 depending on depth

---

## MVP Status — May 2026

Lyceum is deployed on Railway and closed as an MVP. This section documents what is live, what is built but deferred, and what is planned for future phases.

### Live and working
- Onboarding — advisor agent, programme proposal, learner profiling
- Curriculum generation — 4-phase QA pipeline (Clarify → Spec → Review → Generate)
- Lessons — lazy generation, professor Q&A with SSE streaming, persistent learner memory
- Practice problems — spec-time generation, Haiku grader
- Assignments + exams — progressively unlocked, Assessor agent with rubric + extended thinking
- Difficulty detection — passive signal aggregation, advisor nudges
- Study groups — 4 AI classmates with distinct personas
- Knowledge graph — course and lesson nodes, prerequisite edges, click to navigate
- Transcript — live academic record with semester GPA and course grades, browser PDF download
- Graduation + certificate — eligibility check, unique UUID verification code, public verify endpoint
- Daily streak tracking
- Per-user monthly caps — $2 spending / 50 LLM requests (from `agent_traces`), configurable via env vars
- Registration gated by `REGISTRATION_OPEN=true` env var (currently open)

### Deferred — built but removed from UI
- **Flashcards** — SM-2 spaced repetition fully implemented (backend routes intact, database schema in migration 009, `FlashcardView.jsx` preserved). Removed from UI in May 2026 due to unstable generation timing. Revisit when content pipeline is more predictable.
- **Voice lectures** — ElevenLabs TTS + Whisper STT planned. `lectures.js` returns 501. `useVoice` hook scaffolded. Phase 2.

### Known gaps
- Email streak reminders — Nodemailer is wired; SMTP config required (works locally, not configured on Railway)
- Per-user cap is in-process only; spans correctly across restarts via `agent_traces` DB reads, but would need Redis/DB advisory lock for true multi-instance enforcement
- Test suite references flashcard routes that are no longer accessible from the UI; backend tests still pass, integration tests may need update if flashcard routes are removed

---

## What it does

### Onboarding → Advisor Agent
You talk to an advisor who elicits your goals, background, and constraints through natural conversation. No forms. The advisor produces a structured programme proposal — degree type, field of study, number of semesters, course list with prerequisites — and waits for your approval before generating anything.

### Curriculum Generation → 4-Phase QA Pipeline
Once confirmed, a pipeline runs in the background:

```
Phase 1  CLARIFY   Extract learner profile (Haiku, ~200 tokens)
Phase 2  SPEC      Write detailed lesson specs — misconceptions, worked examples,
                   practice problems, blackboard cues (Sonnet, per lesson)
Phase 3  REVIEW    A second agent reads each spec and flags quality issues (Sonnet)
Phase 4  GENERATE  Full lesson content written against the spec (Sonnet)
```

This is not "generate a lesson". It is closer to how a curriculum design team works: specify, review, then write. The QA agent can reject a spec and force a rewrite before content generation starts.

### Live Lectures → Professor Agent (Streaming)
Each lesson has a whiteboard with structured content and a professor in the right rail. You ask questions; the professor responds in real time via SSE streaming. The professor knows:
- The lesson content and worked examples
- Common misconceptions flagged during spec
- Your history with this topic (learner memory, see below)

### Persistent Learner Memory
Every 4th professor turn, a background Haiku call reads the conversation and extracts structured facts:

```json
[
  { "type": "struggle",    "content": "Confuses limits with derivatives", "lesson_title": "Calculus I" },
  { "type": "preference",  "content": "Learns better with visual analogies" },
  { "type": "mastery",     "content": "Solid on chain rule after 3rd explanation" }
]
```

These are stored as JSONB (max 30, newest-first), injected into every subsequent professor session. The tutor is never cold again after the first few exchanges.

### Practice Mode → Practice Agent
Practice problems are generated during the QA spec phase, not on-demand. When you answer one, a Haiku call grades it against the expected solution and returns `score / verdict / feedback / hint`. The grader is instructed to evaluate understanding, not surface pattern-matching.

### Spaced Repetition → SM-2 Algorithm
Flashcard decks are auto-generated from each lesson's worked examples and misconceptions. The SM-2 algorithm schedules reviews: quality 0–2 resets the card; quality 3–5 advances the easiness factor and interval. Due cards surface in the Dashboard and Sidebar. No third-party SRS service — pure implementation in 40 lines.

### Difficulty Detection → Passive + Active Signals
The system watches for learning difficulty without asking:

| Signal | Weight | Trigger |
|--------|--------|---------|
| Lesson time > 2× estimated | 2 pts | Passive |
| Lesson opened 3+ times | 1 pt | Passive |
| Assignment score < 60% | 2 pts | Passive |
| Exam score < 50% | 3 pts | Passive |
| 3+ days of inactivity | 2 pts | Passive |
| Student clicks "I'm struggling" | 3 pts | Active |

When the weighted score crosses a threshold, the Advisor nudges you — suggests a different approach, flags a specific gap, or recommends a study session. One nudge per 48-hour window, never spammy.

### Assessments → Assessor Agent (Extended Thinking)
Assignments are graded against a rubric generated alongside the assignment spec. The assessor uses extended thinking to reason about partial credit, identify the strongest and weakest parts of a submission, and write feedback in encouraging but honest language. Exams are auto-graded against expected answers.

### Study Groups → 4 AI Classmates
Study sessions give you 4 persistent AI classmates, each with a distinct learning style:

| Persona | Style |
|---------|-------|
| **Mia** | Asks "why?" — drives conceptual depth |
| **Leo** | Demands rigour — pushes for formal definitions |
| **Zoe** | Builds analogies — bridges abstract to concrete |
| **Kai** | Socratic — turns questions back on you |

The system rotates who responds, avoids repetition, and keeps 12 turns of shared context.

### Knowledge Graph
Every programme has a visual prerequisite map — course nodes laid out by semester, edges showing dependencies, colours showing completion status. Pan and zoom. Click a node to navigate directly to the course.

### Transcript + Verifiable Certificate
The transcript is a live academic record. When graduation requirements are met (70% lessons visited, at least one submission and exam attempt per core course), you can issue a certificate with a unique UUID verification code. `GET /api/certificates/:code` is public — anyone can verify authenticity without an account.

### Streak + Email Reminders
A daily activity streak (lesson visits, study sessions) is tracked atomically in a single SQL `UPDATE CASE`. At 8pm, a background job emails users whose streak is at risk. No external scheduler — a `setInterval` hourly check with deduplication.

---

## AI Architecture

This is the part that makes Lyceum different from a chatbot with a lesson template.

### Eight specialised agents, not one

```
Advisor          ─── goal elicitation, programme proposal, semester review
Clarifier        ─── pre-generation learner profiling
Curriculum       ─── programme skeleton + lesson stubs (parallel, 3 at a time)
QA Reviewer      ─── reads specs, flags quality issues, can reject and requeue
Professor        ─── streaming Q&A with learner memory + spec context
Assessor         ─── rubric grading with extended thinking
Practice Grader  ─── answer evaluation (Haiku — 10–15 token output)
Memory Extractor ─── structured fact extraction from conversations (Haiku)
Study Classmate  ─── 4 personas in one agent, rotating speaker selection
```

Each agent has a tightly scoped system prompt. The professor does not know about grading. The assessor does not know about onboarding. Scoping prevents prompt pollution and makes each agent reliable at its specific task.

### Cost-aware model routing

Different tasks warrant different models. Lyceum routes explicitly:

| Task | Model | Why |
|------|-------|-----|
| Lesson content generation | Sonnet | Balance of quality and cost |
| QA review | Sonnet | Needs judgement, not raw speed |
| Professor Q&A | Sonnet (FAST) | Real-time streaming |
| Practice grading | Haiku | Short output, deterministic rubric |
| Memory extraction | Haiku | Small structured output |
| Rubric assessment | Sonnet + extended thinking | Nuanced partial credit |

Cost per full programme generation: ~$0.30–1.50. The QA pipeline adds ~15% overhead but catches hallucinated content and spec drift before it reaches the student.

### The QA pipeline is the moat

The insight: LLM-generated curriculum has the same failure modes as human-written curriculum — vague learning objectives, missing worked examples, misconceptions that go unaddressed. The solution is the same too: spec it first, then review the spec, then write to the spec.

Phase 2 forces the generator to commit to: what the student will struggle with, what examples exist, what the practice problems test, what a blackboard session would show. Phase 3 reads that spec with fresh context and flags gaps. Phase 4 generates against a validated spec.

The result is lesson content that is structurally sound before it is aesthetically polished.

### Lazy generation with progressive reveal

Users never wait for the full curriculum to generate:

```
Advisor confirms → programme skeleton written (course list, no content)
Student opens course → lesson stubs generated (~4s, titles + summaries)
                     → lesson 1 pre-generated in background (~6s)
                     → assignments + exams generate concurrently
Student opens lesson → full content generates if not yet ready (~6s)
                     → future lessons pre-generate in background
```

Every screen is immediately usable. Content arrives before the student reaches it.

### Telemetry with per-agent cost tracking

Every Claude API call logs `{ agent, model, input_tokens, output_tokens, cost_usd, duration_ms }`. The Dashboard shows running total cost. This makes AI cost visible and manageable — not a surprise at the end of the month.

---

## Stack

```
Backend          Node.js (ESM) + Express
Database         PostgreSQL 16 (pg driver, connection pool, migrations)
AI              Anthropic Claude API (@anthropic-ai/sdk)
Auth             JWT (jsonwebtoken + bcryptjs)
Job Queue        In-process setImmediate (drop-in BullMQ upgrade path)
Email            Nodemailer (SMTP-optional, degrades gracefully)
Frontend         React 18 + React Router 6 (no UI framework — custom CSS)
Build            Vite 5
Testing          Vitest (unit + integration + E2E)
Containers       Docker Compose (postgres + redis + api + ui)
```

No ORM. Raw SQL with parameterised queries throughout. The schema is in 17 versioned migration files.

---

## Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or Docker)
- Anthropic API key

### Local setup

```bash
# Clone
git clone https://github.com/chintan-dshel/lyceum.git
cd lyceum

# API
cd homeuni-api
cp .env.example .env          # fill in ANTHROPIC_API_KEY
npm install
npm run migrate               # creates all 11 tables
npm run dev                   # http://localhost:3001

# UI (separate terminal)
cd homeuni-ui
npm install
npm run dev                   # http://localhost:5173
```

### Docker (full stack)

```bash
# Set required secrets
export JWT_SECRET=$(openssl rand -hex 32)
export ANTHROPIC_API_KEY=sk-ant-...

docker compose up
# UI → http://localhost:5173
# API → http://localhost:3001
```

---

## Test suite

```bash
cd homeuni-api

npm test              # 160 tests — unit + integration (no API calls, ~3s)
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npm run test:e2e      # pipeline contract tests vs live Claude (~$0.10–0.15/run)
```

### What's covered

| Layer | Files | Tests |
|-------|-------|-------|
| Unit | sm2, learnerMemory, modelPricing, emailService, middleware, courseGenerator | 100 |
| Integration | auth, flashcards, certificates, crossUserIsolation | 53 |
| E2E | pipeline (live Claude, real DB, full 4-phase run) | 7 |

Integration tests use a real PostgreSQL database (no mocks). Each test creates a UUID-keyed user and cleans up via CASCADE DELETE. The E2E suite is excluded from the default `npm test` run — it calls the real Claude API and costs real money.

---

## Project structure

```
lyceum/
├── homeuni-api/
│   ├── migrations/          11 SQL migration files
│   ├── src/
│   │   ├── jobs/            queue.js · curriculum.job.js · streak.job.js
│   │   ├── lib/             8 agents + sm2 · learner.memory · streak · email · pricing
│   │   ├── middleware/       auth · errors · rateLimit · injectionDetection · piiAudit
│   │   ├── routes/          auth · programs · curriculum · lessons · assignments
│   │   │                    exams · flashcards · study · progress · telemetry
│   │   └── __tests__/       unit/ · integration/ · e2e/
│   ├── .env.example
│   └── package.json
├── homeuni-ui/
│   └── src/
│       ├── views/           15 views (Dashboard → Lesson → Transcript → Certificate)
│       ├── components/      Sidebar · TopBar · ProfessorPanel · ProgressRing + ui/
│       ├── hooks/           useAuth · useLesson · useProgram · useVoice + 3 more
│       └── lib/api.js       typed fetch wrapper, all endpoints
├── docker-compose.yml
└── README.md
```

---

## What this cost to build

One developer. Two weeks of focused sessions with Claude as a pair programmer. The AI didn't write boilerplate — it designed the QA pipeline, implemented SM-2, caught the vacuous-truth graduation bug, and wrote 160 tests that have never been seen to trivially pass.

The hardest problem wasn't the AI integration. It was the same problem as any non-trivial software: thinking clearly about the data model, the failure modes, and what a real learner actually needs. AI makes you faster at implementing clear thinking. It doesn't replace the thinking.

---

## Roadmap

**Phase 2 — Voice + Whiteboard**
- [ ] ElevenLabs TTS for professor responses — stream audio alongside text
- [ ] Whisper STT — speak questions instead of typing
- [ ] tldraw whiteboard — live diagram board during lessons

**Phase 3 — Scale**
- [ ] Cohorts — shared study sessions across multiple learners on the same programme
- [ ] Mobile — React Native client, push notifications for streak and due content
- [ ] Knowledge Graph V2 — lesson-level nodes with completion colour overlay

**Deferred features to revisit**
- [ ] Flashcards — restore to UI once generation timing is stable; SM-2 and all backend routes are intact

---

*Built with [Claude](https://claude.ai) · Powered by [Anthropic](https://anthropic.com)*
