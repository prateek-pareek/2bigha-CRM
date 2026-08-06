/**
 * Cartoon-style sounds & stage helpers — Web Audio (no asset files).
 * Used by PM board, CRM kanban, and wiki. Gated by HR Settings `boardEffectsEnabled`.
 */

import { isSuiteBoardEffectsEnabled } from '@/lib/suite-appearance';

let sharedCtx: AudioContext | null = null;

const STORAGE_KEY = 'suite-cartoon-sfx';
const LEGACY_PM_KEY = 'pm-board-drag-sound';

function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') {
        sharedCtx = new Ctor();
    }
    return sharedCtx;
}

export type CartoonSound =
    | 'pickup'
    | 'hover'
    | 'drop'
    | 'win'
    | 'create'
    | 'cancel'
    | 'lose'
    | 'write'
    | 'pageTurn';

/** @deprecated alias — maps to cartoon sounds for PM compatibility */
export type BoardDragSound = 'pickup' | 'hover' | 'drop' | 'done' | 'cancel' | 'create';

export function isCartoonEffectsEnabled(): boolean {
    if (!isSuiteBoardEffectsEnabled()) return false;
    if (typeof window === 'undefined') return false;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'off') return false;
        if (stored === 'on') return true;
        const legacy = localStorage.getItem(LEGACY_PM_KEY);
        if (legacy === 'off') return false;
    } catch {
        /* ignore */
    }
    return true;
}

export function setCartoonEffectsEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
        localStorage.setItem(LEGACY_PM_KEY, enabled ? 'on' : 'off');
    } catch {
        /* ignore */
    }
}

export function isCelebrationStage(
    stageName: string,
    options?: { probability?: number },
): boolean {
    const n = (stageName || '').toLowerCase().trim();
    if (options?.probability !== undefined && options.probability >= 100) return true;
    if (/\b(lost|closed\s*lost|disqualified|junk|spam|dead|no\s*show)\b/.test(n)) return false;
    return /\b(won|closed\s*won|converted|customer|signed|closed|complete|done|success|qualified)\b/.test(
        n,
    );
}

export function isLostStage(stageName: string): boolean {
    const n = (stageName || '').toLowerCase().trim();
    return /\b(lost|closed\s*lost|disqualified|junk|spam|dead|unqualified)\b/.test(n);
}

export function playCartoonSound(mode: CartoonSound, volumeMultiplier = 1): void {
    if (!isCartoonEffectsEnabled()) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const play = () => {
        try {
            const t0 = ctx.currentTime;
            const vol = Math.max(0.0001, Math.min(0.28, 0.13 * volumeMultiplier));

            const tone = (
                freq: number,
                start: number,
                dur: number,
                gain = 1,
                type: OscillatorType = 'sine',
            ) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.connect(g);
                g.connect(ctx.destination);
                osc.type = type;
                osc.frequency.setValueAtTime(freq, start);
                g.gain.setValueAtTime(0.0001, start);
                g.gain.exponentialRampToValueAtTime(vol * gain, start + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
                osc.start(start);
                osc.stop(start + dur + 0.02);
            };

            const sweep = (
                f0: number,
                f1: number,
                start: number,
                dur: number,
                gain = 1,
                type: OscillatorType = 'triangle',
            ) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.connect(g);
                g.connect(ctx.destination);
                osc.type = type;
                osc.frequency.setValueAtTime(f0, start);
                osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), start + dur * 0.85);
                g.gain.setValueAtTime(0.0001, start);
                g.gain.exponentialRampToValueAtTime(vol * gain, start + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
                osc.start(start);
                osc.stop(start + dur + 0.03);
            };

            switch (mode) {
                case 'pickup':
                    sweep(180, 520, t0, 0.14, 0.9, 'triangle');
                    tone(660, t0 + 0.05, 0.06, 0.45, 'sine');
                    break;
                case 'hover':
                    tone(880, t0, 0.04, 0.3, 'sine');
                    tone(1100, t0 + 0.02, 0.03, 0.2, 'triangle');
                    break;
                case 'drop':
                    sweep(420, 220, t0, 0.1, 0.75, 'triangle');
                    tone(330, t0 + 0.06, 0.12, 0.65, 'sine');
                    break;
                case 'win':
                    tone(523.25, t0, 0.12, 0.75, 'triangle');
                    tone(659.25, t0 + 0.08, 0.12, 0.8, 'sine');
                    tone(783.99, t0 + 0.16, 0.14, 0.85, 'triangle');
                    tone(1046.5, t0 + 0.24, 0.2, 0.95, 'sine');
                    tone(1318.5, t0 + 0.32, 0.22, 0.7, 'triangle');
                    break;
                case 'create':
                    tone(440, t0, 0.06, 0.7, 'triangle');
                    sweep(300, 700, t0 + 0.04, 0.1, 0.8, 'sine');
                    tone(880, t0 + 0.1, 0.08, 0.55, 'sine');
                    break;
                case 'cancel':
                    sweep(360, 140, t0, 0.16, 0.55, 'triangle');
                    tone(196, t0 + 0.1, 0.14, 0.4, 'sine');
                    break;
                case 'lose':
                    sweep(280, 120, t0, 0.22, 0.5, 'sawtooth');
                    tone(155, t0 + 0.14, 0.18, 0.35, 'triangle');
                    break;
                case 'write':
                    tone(920 + Math.random() * 180, t0, 0.028, 0.22, 'triangle');
                    sweep(640, 380, t0 + 0.01, 0.05, 0.18, 'sine');
                    break;
                case 'pageTurn':
                    sweep(240, 90, t0, 0.14, 0.4, 'sine');
                    tone(180, t0 + 0.09, 0.11, 0.32, 'triangle');
                    tone(120, t0 + 0.14, 0.08, 0.2, 'sine');
                    break;
                default:
                    break;
            }
        } catch {
            /* ignore */
        }
    };

    if (ctx.state === 'suspended') {
        void ctx.resume().then(play).catch(() => {});
    } else {
        play();
    }
}

/** PM board compatibility shim */
export function playBoardDragSoundCompat(mode: BoardDragSound, volumeMultiplier = 1): void {
    const map: Record<BoardDragSound, CartoonSound> = {
        pickup: 'pickup',
        hover: 'hover',
        drop: 'drop',
        done: 'win',
        cancel: 'cancel',
        create: 'create',
    };
    playCartoonSound(map[mode], volumeMultiplier);
}

export function playCartoonCreate(): void {
    playCartoonSound('create');
}
