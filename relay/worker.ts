export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") {
      return new Response("avious-party relay", { status: 200 });
    }
    const room = url.searchParams.get("room");
    if (!room) return new Response("missing room", { status: 400 });
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const id = env.ROOM.idFromName(room);
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
