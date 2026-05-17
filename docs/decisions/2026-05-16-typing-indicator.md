# Typing indicator — scope note

Date: 2026-05-16
Status: Queued (next presence-richness primitive after reactions shipped at v0.4.0)

## Goal

When peer X is typing in chat, all other peers see "X is typing…" above the chat input. Dims and disappears after 3s of silence from X.

## Protocol

Add to `shared/protocol.ts`:

```ts
export type TypingMsg = {
  type: "typing";
  from: ClientId;
  name: string;
  ts: number;
};
```

Include in `WireMsg` union. No `until` field — receiver applies its own 3s decay timer.

## Relay (`relay/room.ts`)

Add `case "typing"` next to `case "reaction"`. **No rate limit** — natural keystroke debounce on the client side is sufficient, and rate-limiting typing events would feel laggy if a fast typer crossed the threshold. Broadcast to all (including sender — receiver-side filter on `from === you` is cheap).

```ts
case "typing":
  this.broadcast({ type: "typing", from: conn.id, name: conn.name, ts: Date.now() }, null);
  return;
```

## Client send (`client/userscript/main.ts` + panel)

In `panel.ts`, on `cp-input` `input` event, call a new `hooks.onTyping()` hook. Throttle on the panel side to **one `typing` send per 1.5s** while keystrokes flow — prevents a 60wpm typer from spamming the relay 5×/sec.

```ts
let lastTypingSent = 0;
input.addEventListener("input", () => {
  const now = Date.now();
  if (now - lastTypingSent > 1500) {
    lastTypingSent = now;
    hooks.onTyping();
  }
});
```

In `main.ts`, wire `onTyping: () => send({ type: "typing", from: you, name: me, ts: Date.now() })`.

## Client render (`panel.ts`)

Add a single-line indicator above `#cp-form`, below `#cp-reactions`:

```html
<div id="cp-typing" style="height:18px;padding:0 12px;font-size:11px;color:#888;opacity:0;transition:opacity 200ms;"></div>
```

On `case "typing"` in main.ts (skip if `msg.from === you`), call `panel.showTyping(msg.name)`. The panel maintains a `Map<from, timeoutId>` keyed by sender ID: when a typing event lands, reset that sender's 3s decay timer. On timer fire, remove from map. Render text:
- 0 active → `opacity:0`
- 1 active → "X is typing…"
- 2 active → "X and Y are typing…"
- 3+ active → "Several people are typing…"

## Open question

- **Send-side throttle interval (1.5s) is a guess.** Compare against the visible decay (3s) — the throttle must be tighter than the decay or the indicator will flicker mid-typing. 1.5s gives 2 sends per decay window, which feels safe. Re-evaluate after smoke-test with a fast typer.

## Files touched

- `shared/protocol.ts` — add `TypingMsg`, extend `WireMsg`
- `relay/room.ts` — add `case "typing"` broadcast (no rate limit, no allowlist)
- `client/userscript/ui/panel.ts` — add `#cp-typing` div, `onTyping` hook, `showTyping(name)` method with multi-sender map + decay timer
- `client/userscript/main.ts` — wire `onTyping` hook + `case "typing"` handler

## Out of scope

- Persisting typing state across reconnect (it's ephemeral by nature)
- Sender-side throttle inside the relay (client-side is cheap and correct)
- Animating the dots ("typing." → "typing.." → "typing…") — ASCII ellipsis is fine for v1
