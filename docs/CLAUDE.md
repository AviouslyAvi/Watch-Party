# docs/ — documentation workspace (Layer 2)

Not code. Three subareas:

## `decisions/`
Architecture decision records. One file per decision. Filename: `YYYY-MM-DD-<slug>.md`. Template:

```
# <Decision title>

Date: YYYY-MM-DD
Status: accepted | superseded by <file>

## Context
Why are we deciding this now?

## Decision
What we picked.

## Alternatives considered
Bullet list, one line each, with why-not.

## Consequences
What this locks us into.
```

Don't edit old decisions in place. If a decision is overturned, write a new one and mark the old as superseded.

## `research/`
Notes about external systems we depend on (Cineby's player DOM, Cloudflare DO limits, Tampermonkey edge cases). Long-lived. Update freely.

## `HANDOFF.md`
The single resume-from-here document. Per Avi's global CLAUDE.md, every session that does meaningful work ends by updating this file and emitting a fenced resume prompt.

## Rules

- Never put code here. Code goes in its workspace.
- Never invent acronyms. If you use one, define it on first use.
