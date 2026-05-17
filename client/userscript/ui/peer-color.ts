import type { ClientId } from "../../../shared/protocol";

export function colorFor(id: ClientId): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hue = (h >>> 0) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}
