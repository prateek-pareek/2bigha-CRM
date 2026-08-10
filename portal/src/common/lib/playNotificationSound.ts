/**
 * Short in-app notification chime (Web Audio API — no asset file).
 * May stay silent until the user has interacted with the page (browser autoplay policy).
 */
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx || sharedCtx.state === "closed") {
        sharedCtx = new Ctor();
    }
    return sharedCtx;
}

type NotificationSoundMode = "default" | "ringtone";
type NotificationSoundOptions = {
    volumeMultiplier?: number;
};

export function playNotificationSound(
    mode: NotificationSoundMode = "default",
    options: NotificationSoundOptions = {},
): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    const play = () => {
        try {
            const t0 = ctx.currentTime;
            const masterBase = mode === "ringtone" ? 0.5 : 0.1;
            const volumeMultiplier = Math.max(0, Math.min(2, Number(options.volumeMultiplier ?? 1)));
            const master = Math.max(0.0001, masterBase * volumeMultiplier);
            const wave: OscillatorType = mode === "ringtone" ? "triangle" : "sine";
            const attack = mode === "ringtone" ? 0.01 : 0.015;
            const makeTone = (freq: number, start: number, dur: number, gain = 1) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.connect(g);
                g.connect(ctx.destination);
                osc.type = wave;
                osc.frequency.setValueAtTime(freq, start);
                g.gain.setValueAtTime(0.0001, start);
                g.gain.exponentialRampToValueAtTime(master * gain, start + attack);
                g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
                osc.start(start);
                osc.stop(start + dur);
            };
            if (mode === "ringtone") {
                // Dual-tone pattern cuts through ambient noise better than a short chime.
                makeTone(720, t0, 0.22, 1);
                makeTone(960, t0 + 0.05, 0.24, 0.95);
                makeTone(720, t0 + 0.28, 0.2, 0.9);
                makeTone(1180, t0 + 0.32, 0.16, 0.85);
            } else {
                makeTone(880, t0, 0.12);
                makeTone(1174, t0 + 0.1, 0.14);
            }
        } catch {
            /* ignore */
        }
    };

    if (ctx.state === "suspended") {
        void ctx.resume().then(play).catch(() => {});
    } else {
        play();
    }
}
