"use client";

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function startRingtone(): void {
  stopRingtone();
  const ac = ensureCtx();
  if (!ac) return;

  const beep = (freq: number, startAt: number) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ac.currentTime + startAt;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  };

  const play = () => {
    beep(440, 0);
    beep(880, 0.18);
  };
  play();
  timer = setInterval(play, 1000);
}

export function stopRingtone(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}