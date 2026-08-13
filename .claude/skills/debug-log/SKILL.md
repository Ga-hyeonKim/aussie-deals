---
name: debug-log
description: A bug whose cause was not obvious from the symptom has just been narrowed down, or DEBUGGING.md needs an entry. Load while the numbers are still to hand, not at wrap-up.
---

# Writing up a diagnosis

## When

**As it happens** — while the numbers are still in the terminal. Not at wrap-up.

The git history shows the opposite has been happening: `docs: draft the lessons
for all eleven debugging cases` wrote eleven `**배운 것**` lines in one batch,
retroactively. By then the measurements are gone and it is memory of a memory.

## What goes in

Only problems where the **symptom did not reveal the cause** and narrowing was
required.

Do not add:
- bugs whose cause was obvious (typo, missing import)
- **anything whose scope was not measured with a number.** A guess-and-fix does
  not go in this file. This is the rule that keeps it worth reading.

## Format

Newest first, at the top of the dated section.

```markdown
## YYYY-MM-DD · [증상 한 줄]

**증상** — 무엇이 어떻게 잘못 보였나. 실제 값과 로그를 그대로.

**좁혀간 과정**
1. 확인한 것 → 알게 된 것
2. ...
   범위는 실제 숫자로 (예: 6,619건 중 1,985건 = 30%)

**원인** — 진짜 원인. 표면 증상과 다르면 그 차이를 명시.

**처방** — 무엇을 바꿨나 + 커밋 해시

**재발 방지** — 있으면. 없으면 생략.

**배운 것** —
```

Rules:
- **틀렸던 가설을 남길 것.** 어디를 잘못 봤는지가 다음번에 제일 도움된다.
- 아직 안 고쳤으면 제목에 `(진행 중)`, 처방은 `**처방 (계획)**`.

## `**배운 것**` — Claude writes this

Changed 2026-08-12; it used to be left blank.

Write it as an **interview answer**, containing three things:

1. the claim the measurement actually licences — no more than the numbers support
2. the judgement call that was made, and what was given up
3. what generalises past this specific bug

Put the numbers inside the sentences so the claim stays checkable. No praise, no
restating the fix, no "이번 경험을 통해".

These entries are a portfolio asset, not bookkeeping — they are what makes an
interviewer ask a follow-up question. Write them so they survive being read cold
by a stranger.

## Then

If the case produced a rule that must always hold, it does **not** stay prose.
Add the invariant to `CLAUDE.md` *and* write the case in a `lib/` test. A rule
that lives only in a markdown file gets re-implemented inline somewhere else.
