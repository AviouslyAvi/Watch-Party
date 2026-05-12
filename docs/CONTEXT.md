# docs/ — knowledge base (Layer 2)

The project's memory. Decisions made, research scratchpads, and the active handoff doc that bootstraps a new chat.

## Load

- `HANDOFF.md` — **always read this first** when resuming work. Current state, what's done, exact next step, open decisions.
- `decisions/YYYY-MM-DD-<slug>.md` — one file per non-obvious technical decision. Skim titles; read the relevant one.
- `research/<topic>.md` — investigation notes. Skim by topic.

## Skip

Code workspaces (`shared/`, `client/`, `relay/`, `landing/`). This room is text-only.

## Pipeline

- **Resuming a session**: read `HANDOFF.md`, jump to the workspace it points at.
- **Logging a decision**: new file in `decisions/` with today's date and a kebab-case slug. Title, context, decision, consequences.
- **Capturing research**: new file in `research/` named after the topic. Free-form is fine.
- **Updating the handoff**: rewrite `HANDOFF.md` in place at the end of a session covering status, what's done, exact next step, open questions, known risks.

## Rules

- Don't squat on `HANDOFF.md` to log decisions. Decisions go in `decisions/`. The handoff is a snapshot, not a journal.
- Keep filenames lowercase-kebab-case except for `HANDOFF.md`.

## Skills/MCP

None required.
