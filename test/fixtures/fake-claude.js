#!/usr/bin/env bun
// Fake claude for chat tests: replays a scenario, logs stdin lines.
// Steps: write, delay, waitStdin, exit, stubborn, stderr, big, pauseStdin.
const fs = require('node:fs');
const { SCENARIO, LOG, ARGV, ENVF } = process.env;
fs.writeFileSync(ARGV, JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(ARGV + '.pid', String(process.pid));
fs.writeFileSync(ENVF, JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CLAUDE_CODE_') && !k.includes('TOKEN')))));
const steps = JSON.parse(fs.readFileSync(SCENARIO, 'utf8'));
let lines = 0;
let buf = '';
let ended = false;
const waiters = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    fs.appendFileSync(LOG, buf.slice(0, i) + '\n');
    buf = buf.slice(i + 1);
    lines++;
  }
  waiters.filter((w) => lines >= w.n).forEach((w) => w.resolve());
});
process.stdin.on('end', () => {
  ended = true;
  if (!steps.some((s) => s.stubborn)) {
    process.exit(0);
  }
});
const wait = (n) => (lines >= n ? Promise.resolve() : new Promise((resolve) => waiters.push({ n, resolve })));
(async () => {
  for (const s of steps) {
    if (s.delay) {
      await new Promise((r) => setTimeout(r, s.delay));
    }
    if (s.pauseStdin) {
      process.stdin.pause();
      setTimeout(() => process.stdin.resume(), s.pauseStdin);
    }
    if (s.waitStdin) {
      await wait(s.waitStdin);
    }
    if (s.stderr) {
      process.stderr.write(s.stderr);
    }
    if (s.write) {
      process.stdout.write(s.write);
    }
    if (s.big) {
      process.stdout.write('x'.repeat(s.big));
    }
    if (s.stubborn) {
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    }
    if (s.exit !== undefined) {
      // Exit after stdout drains
      process.stdout.write('', () => process.exit(s.exit));
    }
  }
})();
