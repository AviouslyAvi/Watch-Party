import type { WireMsg, SyncMsg, Participant, ClientId } from "../shared/protocol";
import { isReactionEmoji } from "../shared/protocol";

type Conn = {
  id: ClientId;
  name: string;
  pathname: string;
  ws: WebSocket;
  reactionStamps: number[];
  lastRenameAt: number;
};

const REACTION_WINDOW_MS = 10_000;
const REACTION_LIMIT = 5;
const RENAME_COOLDOWN_MS = 5_000;
const NAME_MAX = 32;

export class Room {
  private conns = new Map<ClientId, Conn>();
  private adminId: ClientId | null = null;
  private operators = new Set<ClientId>();
  private freeForAll = false;
  private lastState: SyncMsg | null = null;
  private passphrase: string | null = null;

  async fetch(req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    const id = crypto.randomUUID();
    let registered = false;
    let conn: Conn | null = null;

    server.addEventListener("message", (evt: MessageEvent) => {
      let msg: WireMsg;
      try {
        msg = JSON.parse(typeof evt.data === "string" ? evt.data : "");
      } catch {
        return;
      }

      if (!registered) {
        if (msg.type !== "hello") return;

        // Passphrase gate: first connection pins the room's passphrase (or null
        // if the first joiner didn't supply one). Later joiners must match.
        const supplied = msg.passphrase ?? null;
        if (this.conns.size === 0) {
          this.passphrase = supplied;
        } else if ((this.passphrase ?? null) !== supplied) {
          try { server.send(JSON.stringify({ type: "rejected", reason: "passphrase" })); } catch {}
          try { server.close(4001, "passphrase"); } catch {}
          return;
        }

        conn = {
          id,
          name: (msg.name ?? "").slice(0, NAME_MAX),
          pathname: msg.pathname,
          ws: server,
          reactionStamps: [],
          lastRenameAt: 0,
        };
        this.conns.set(id, conn);
        if (!this.adminId) this.adminId = id;
        registered = true;

        const welcome: WireMsg = {
          type: "welcome",
          you: id,
          adminId: this.adminId,
          operators: [...this.operators],
          freeForAll: this.freeForAll,
          participants: this.listParticipants(),
          lastState: this.lastState,
        };
        server.send(JSON.stringify(welcome));
        this.broadcastParticipants();

        const existing = [...this.conns.values()].find((c) => c.id !== id);
        if (existing && existing.pathname !== msg.pathname) {
          server.send(
            JSON.stringify({
              type: "pathDiff",
              theirPath: existing.pathname,
              yourPath: msg.pathname,
            }),
          );
        }
        return;
      }
      if (!conn) return;

      switch (msg.type) {
        case "play":
        case "pause":
        case "seek":
        case "state": {
          if (!this.canDrive(conn.id)) {
            this.sendRevert(conn);
            return;
          }
          this.lastState = msg;
          this.broadcast(msg, conn.id);
          return;
        }
        case "chat": {
          this.broadcast({ ...msg, from: conn.id, name: conn.name }, null);
          return;
        }
        case "reaction": {
          if (!isReactionEmoji(msg.emoji)) return;
          const now = Date.now();
          conn.reactionStamps = conn.reactionStamps.filter((t) => now - t < REACTION_WINDOW_MS);
          if (conn.reactionStamps.length >= REACTION_LIMIT) return;
          conn.reactionStamps.push(now);
          this.broadcast(
            { type: "reaction", from: conn.id, name: conn.name, emoji: msg.emoji, ts: now },
            null,
          );
          return;
        }
        case "typing": {
          this.broadcast({ type: "typing", from: conn.id, name: conn.name, ts: Date.now() }, null);
          return;
        }
        case "ffa": {
          if (conn.id !== this.adminId) return;
          this.freeForAll = msg.freeForAll;
          this.broadcast({ type: "ffa", freeForAll: this.freeForAll }, null);
          return;
        }
        case "rename": {
          const now = Date.now();
          if (now - conn.lastRenameAt < RENAME_COOLDOWN_MS) return;
          const next = (msg.name ?? "").trim().slice(0, NAME_MAX);
          if (!next || next === conn.name) return;
          conn.name = next;
          conn.lastRenameAt = now;
          // Broadcast both the participants snapshot (so lists update) and a
          // rename event (so clients can retroactively re-label chat history).
          this.broadcast({ type: "rename", from: conn.id, name: next }, null);
          this.broadcastParticipants();
          return;
        }
        case "promote": {
          if (conn.id !== this.adminId) return;
          if (typeof msg.target !== "string") return;
          if (msg.target === this.adminId) return;
          if (!this.conns.has(msg.target)) return;
          this.operators.add(msg.target);
          this.broadcastParticipants();
          return;
        }
        case "demote": {
          if (conn.id !== this.adminId) return;
          if (typeof msg.target !== "string") return;
          if (!this.operators.delete(msg.target)) return;
          this.broadcastParticipants();
          return;
        }
        case "navigate": {
          // Admin + operators only. Deliberately EXCLUDES freeForAll: yanking
          // everyone to a new page is far more disruptive than a seek, so
          // free-for-all should not grant it.
          if (!(conn.id === this.adminId || this.operators.has(conn.id))) return;
          if (typeof msg.url !== "string" || !/^https?:\/\//i.test(msg.url)) return;
          this.broadcast(
            {
              type: "navigate",
              from: conn.id,
              url: msg.url,
              title: typeof msg.title === "string" ? msg.title.slice(0, 200) : undefined,
              ts: Date.now(),
            },
            conn.id, // don't echo to sender — they're already there
          );
          return;
        }
      }
    });

    const close = () => {
      if (conn) {
        this.conns.delete(conn.id);
        this.operators.delete(conn.id);
        if (this.adminId === conn.id) {
          const next = this.conns.keys().next();
          this.adminId = next.done ? null : next.value;
          // Fresh slate for the new admin — operators don't carry across admin transfer.
          this.operators.clear();
        }
        if (this.conns.size === 0) {
          // Empty room → reset pinned passphrase so the next first-joiner can re-pin.
          this.passphrase = null;
          this.operators.clear();
        }
        this.broadcastParticipants();
      }
    };
    server.addEventListener("close", close);
    server.addEventListener("error", close);

    return new Response(null, { status: 101, webSocket: client });
  }

  private canDrive(id: ClientId): boolean {
    return id === this.adminId || this.operators.has(id) || this.freeForAll;
  }

  private listParticipants(): Participant[] {
    return [...this.conns.values()].map((c) => ({
      id: c.id,
      name: c.name,
      isAdmin: c.id === this.adminId,
      isOperator: this.operators.has(c.id),
    }));
  }

  private broadcastParticipants() {
    if (!this.adminId) return;
    const msg: WireMsg = {
      type: "participants",
      participants: this.listParticipants(),
      adminId: this.adminId,
      operators: [...this.operators],
    };
    this.broadcast(msg, null);
  }

  private broadcast(msg: WireMsg, exceptId: ClientId | null) {
    const data = JSON.stringify(msg);
    for (const c of this.conns.values()) {
      if (c.id === exceptId) continue;
      try {
        c.ws.send(data);
      } catch {}
    }
  }

  private sendRevert(conn: Conn) {
    const ls = this.lastState;
    const at = ls ? ls.at : 0;
    const paused = ls ? (ls.type === "pause" || (ls.type === "state" && ls.paused)) : true;
    try {
      conn.ws.send(JSON.stringify({ type: "revert", at, paused }));
    } catch {}
  }
}
