import type { WireMsg, SyncMsg, Participant, ClientId } from "../shared/protocol";

type Conn = {
  id: ClientId;
  name: string;
  pathname: string;
  ws: WebSocket;
};

export class Room {
  private conns = new Map<ClientId, Conn>();
  private adminId: ClientId | null = null;
  private freeForAll = false;
  private lastState: SyncMsg | null = null;

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
        conn = { id, name: msg.name, pathname: msg.pathname, ws: server };
        this.conns.set(id, conn);
        if (!this.adminId) this.adminId = id;
        registered = true;

        const welcome: WireMsg = {
          type: "welcome",
          you: id,
          adminId: this.adminId,
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
          const isAdmin = conn.id === this.adminId;
          if (!isAdmin && !this.freeForAll) {
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
        case "ffa": {
          if (conn.id !== this.adminId) return;
          this.freeForAll = msg.freeForAll;
          this.broadcast({ type: "ffa", freeForAll: this.freeForAll }, null);
          return;
        }
      }
    });

    const close = () => {
      if (conn) {
        this.conns.delete(conn.id);
        if (this.adminId === conn.id) {
          const next = this.conns.keys().next();
          this.adminId = next.done ? null : next.value;
        }
        this.broadcastParticipants();
      }
    };
    server.addEventListener("close", close);
    server.addEventListener("error", close);

    return new Response(null, { status: 101, webSocket: client });
  }

  private listParticipants(): Participant[] {
    return [...this.conns.values()].map((c) => ({
      id: c.id,
      name: c.name,
      isAdmin: c.id === this.adminId,
    }));
  }

  private broadcastParticipants() {
    if (!this.adminId) return;
    const msg: WireMsg = {
      type: "participants",
      participants: this.listParticipants(),
      adminId: this.adminId,
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
