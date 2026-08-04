export interface MotionTiming {
  dealMs: number;
  winnerHoldMs: number;
  stackMs: number;
  sweepMs: number;
}

export const TRICK_SLOT_XZ = [
  [0, 1.22],
  [-1.28, 0],
  [0, -1.22],
  [1.28, 0]
] as const;

export function relativeSeat(seat: number, ownSeat: number): number {
  return (seat - ownSeat + 4) % 4;
}

export function playedCardYaw(relative: number): number {
  return relative === 0 ? 0 : -relative * Math.PI / 2;
}

export function lerpYaw(from: number, to: number, progress: number): number {
  const turn = Math.PI * 2;
  const delta = ((to - from + Math.PI) % turn + turn) % turn - Math.PI;
  return from + delta * progress;
}

export function motionTiming(reducedMotion: boolean): MotionTiming {
  return reducedMotion
    ? { dealMs: 90, winnerHoldMs: 120, stackMs: 90, sweepMs: 120 }
    : { dealMs: 430, winnerHoldMs: 300, stackMs: 250, sweepMs: 380 };
}

export function collectionStart(now: number, latestDealStartedAt: number, timing: MotionTiming): number {
  return Math.max(now + 60, latestDealStartedAt + timing.dealMs + 90);
}
