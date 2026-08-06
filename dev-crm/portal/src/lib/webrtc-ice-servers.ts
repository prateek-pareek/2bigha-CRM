/**
 * WebRTC ICE server list for calls and huddles.
 *
 * For peers on different networks (NAT / symmetric NAT / strict firewalls), STUN alone
 * is often not enough — run a self-hosted TURN server (e.g. coturn) and point the
 * browser at it via env, with no third-party calling service required.
 *
 * Set `NEXT_PUBLIC_WEBRTC_ICE_SERVERS` to a JSON array of RTCIceServer objects, e.g.:
 * `[{"urls":["stun:turn.example.com:3478"]},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`
 *
 * When unset, falls back to a public STUN server (same as previous behavior).
 */
export function getBrowserRtcIceServers(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn("NEXT_PUBLIC_WEBRTC_ICE_SERVERS must be a non-empty JSON array");
      } else {
        return parsed as RTCIceServer[];
      }
    } catch {
      console.warn("Invalid JSON in NEXT_PUBLIC_WEBRTC_ICE_SERVERS");
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
