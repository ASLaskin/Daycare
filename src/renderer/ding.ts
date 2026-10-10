// Plays a ding with WebAudio.

import { type DingRole, pickDing } from "../shared/ding.ts";

let ctx: AudioContext | null = null;
const lastIndex: Record<DingRole, number | null> = {
  master: null,
  worker: null,
};

const context = () => {
  ctx ??= new AudioContext();
  return ctx;
};

export const playDing = (role: DingRole) => {
  const audio = context();
  const pick = pickDing(role, lastIndex[role], Math.random);
  lastIndex[role] = pick.index;
  const { variant } = pick;
  const start = audio.currentTime + 0.02;
  const volume = 0.18 * pick.gain;
  variant.notes.forEach((freq, i) => {
    const at = start + i * variant.gap;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = variant.wave;
    osc.frequency.value = freq;
    osc.detune.value = pick.detuneCents;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + variant.decay);
    osc.connect(env).connect(audio.destination);
    osc.start(at);
    osc.stop(at + variant.decay + 0.05);
  });
};

const PREVIEW_GAP_MS = 900;

export const previewDings = () => {
  playDing("master");
  setTimeout(() => playDing("worker"), PREVIEW_GAP_MS);
};
