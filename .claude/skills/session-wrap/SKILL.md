---
name: session-wrap
description: Ending a work session, or the user says 마무리하자 / wrap up / 정리하자. Updates STATE.md, SESSION_NOTES.md, TODO.md and the other logs from what actually happened, then runs a short recall drill.
---

# Session wrap-up

Base everything on what actually happened in this conversation. Do not mark
anything complete that is still in progress, and do not write a Done line for
work with no file change behind it.

## 1. `STATE.md` — overwrite, do not append

The only always-current state document. Update the sections that moved:
what runs, what is built but unwired, constraints, recent work, measured debt,
next steps. Refresh the date line.

If a section grew stale rather than changed, rewrite it. This file must stay
readable in one pass — that is its whole job.

## 2. `SESSION_NOTES.md` — newest entry on top

```markdown
## YYYY-MM-DD — [세션 한 줄 제목]

**Done:**
- 실제로 완료된 것만

**Next up:**
- 명시적으로 언급된 것만
```

**No Decisions block** — that duplicates `DECISIONS.md`. Link instead if needed.

## 3. `TODO.md`

- Completed this session → `- [x]`
- New work discovered → under the right priority
- Keep the existing priority structure

## 4. `DECISIONS.md` — only when it applies

Only when a decision's *why* will matter later: another approach was viable and
one was chosen, or there was a trade-off. Not bug fixes, not style.

```markdown
## [결정 제목]
- [선택한 방식과 이유]
- **Why:** [핵심 근거]
```

## 5. `CHANGELOG.md` — only when a user would notice

UI, new feature, scraper behaviour, schema. One line under the dated section.

## 6. `DEBUGGING.md` — load the `debug-log` skill

Only if a non-obvious bug was narrowed down this session, and only if its scope
was measured. Should already have been written as it happened; if it was not,
say so rather than reconstructing numbers from memory.

## 7. Recall drill — 3 questions

This is the part that does not get skipped.

Pick **one** area touched this session and ask **three** questions an
interviewer would actually ask about it. Then stop and wait.

Rules:
- **Never write the answer.** Ask, evaluate, point at where the evidence lives
  in the repo. The sentences have to come out of Gahyeon's head or nothing is
  retained — reading a good answer feels like learning and is not.
- Ask about judgement, not recall. "Why this and not that", "how would you
  extend it", "how would you know if it broke" — never "what does this library
  do".
- After a few sessions, ask for the answer **in English**. Technical interview
  English is a closed vocabulary of ~40 words, and this is the only way it gets
  rehearsed. Offer vocabulary, never sentences.
- Three questions, then done. If a gap is big, note it in `TODO.md` rather than
  turning the wrap-up into a study session.

## Finally

One line per file changed, saying what changed. Skip files that did not change.
