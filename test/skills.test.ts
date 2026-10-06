// Fake home in a temp dir; cases share state.

import { afterAll, test } from "bun:test"
import { Effect } from "effect"
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Skills } from "../src/main/skills/Skills.ts"
import type { SkillsListing, SkillState } from "../src/shared/skills.ts"

// Service as promises, failing with the message.
const client = (home: string) => {
  const svc = Effect.runSync(Effect.gen(function* () { return yield* Skills }).pipe(Effect.provide(Skills.layerFor(home))))
  const run = <A>(e: Effect.Effect<A, { message: string }>) =>
    Effect.runPromise(e.pipe(Effect.mapError((err) => new Error(err.message))))
  return {
    list: (dirs: ReadonlyArray<string>) => Effect.runPromise(svc.list(dirs)),
    setState: (input: { id: string; state: string }, dirs: ReadonlyArray<string>) =>
      run(svc.setState(input as { id: string; state: SkillState }, dirs)),
    setPlugin: (input: { id: string; enabled: boolean }, dirs: ReadonlyArray<string>) => run(svc.setPlugin(input, dirs)),
    restore: (input: { id: string }, dirs: ReadonlyArray<string>) => run(svc.restore(input, dirs)),
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daycare-skills-'));
const home = path.join(tmp, 'home');
const proj = path.join(tmp, 'proj');
const claude = path.join(home, '.claude');

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const readJson = (file: string): any => JSON.parse(fs.readFileSync(file, 'utf8'));
const skill = (dir: string, front: string | null, body = 'Body text.\n') => write(path.join(dir, 'SKILL.md'), front === null ? body : `---\n${front}\n---\n${body}`);
const find = (res: SkillsListing, id: string): any => res.skills.find((s) => s.id === id);

// personal
skill(path.join(claude, 'skills', 'pr-review'), 'name: pr-review\ndescription: Review pull requests\nwhen_to_use: When asked to review a PR');
skill(path.join(claude, 'skills', 'bare'), null, '# Just a body, no frontmatter\n');
skill(path.join(claude, 'skills', 'folded'), 'name: folded\ndescription: >\n  First line of text\n  second line of text\n\n  new paragraph\nargument-hint: "[x]"');
skill(path.join(claude, 'skills', 'quoted'), 'name: "quoted-name"\ndescription: \'It\'\'s quoted\'\nwhen_to_use: "Say \\"hi\\""\nallowed-tools:\n  - Read\n  - Bash');
skill(path.join(claude, 'skills', 'locked'), 'description: Manual only\ndisable-model-invocation: true');
write(path.join(claude, 'skills', 'empty-dir', 'notes.txt'), 'no skill here');
// synced (nested)
skill(path.join(claude, 'skills', 'synced', 'uuid-1', 'inner', 'sync-skill'), 'description: Synced one');
// parked
skill(path.join(claude, 'skills-disabled', 'old-skill'), 'description: Parked one');
skill(path.join(claude, 'skills-disabled', 'collide'), 'description: Parked collide');
skill(path.join(claude, 'skills', 'collide'), 'description: Live collide');
// project
skill(path.join(proj, '.claude', 'skills', 'deploy'), 'description: Deploy the app');
skill(path.join(proj, '.claude', 'skills', 'pr-review'), 'description: Project flavored review');
// plugin
const pluginRoot = path.join(claude, 'plugins', 'cache', 'mkt', 'tools', '1.0.0');
skill(path.join(pluginRoot, 'skills', 'lint'), 'description: Lint things');
skill(path.join(claude, 'plugins', 'cache', 'mkt', 'other', '1.0.0', 'skills', 'fmt'), 'description: Format things');
write(path.join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({
  version: 2,
  plugins: {
    'tools@mkt': [{ scope: 'user', installPath: pluginRoot, version: '1.0.0' }],
    'other@mkt': [{ scope: 'user', installPath: path.join(claude, 'plugins', 'cache', 'mkt', 'other', '1.0.0'), version: '1.0.0' }],
  },
}));
// Unrelated keys survive; both scopes override pr-review.
write(path.join(claude, 'settings.json'), JSON.stringify({
  model: 'opus',
  skillOverrides: { 'pr-review': 'name-only' },
  enabledPlugins: { 'tools@mkt': true, 'other@mkt': false, 'unrelated@x': true },
}, null, 2));
write(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, skillOverrides: { 'pr-review': 'off' } }));
// oversized skill
write(path.join(claude, 'skills', 'huge', 'SKILL.md'), '---\ndescription: big\n---\n' + 'x'.repeat(1024 * 1024 + 10));

const skills1 = client(home)


const opts = { home, projectDirs: [proj, path.join(tmp, 'missing-project')] };
let res: SkillsListing;
test('(a) discovery sets source, scope, invoke', async () => {
  res = await skills1.list(opts.projectDirs);
  const p = find(res, 'personal:pr-review');
  assert.deepStrictEqual([p.source, p.scope, p.invoke], ['personal', '~/.claude/skills', '/pr-review']);
  const s = res.skills.find((x) => x.source === 'synced')!;
  assert.deepStrictEqual([s.scope, s.invoke, s.name], ['~/.claude/skills/synced', '/sync-skill', 'sync-skill']);
  const pk = find(res, 'parked:old-skill');
  assert.deepStrictEqual([pk.source, pk.state, pk.scope, pk.listingTokens, pk.locked], ['parked', 'parked', '~/.claude/skills-disabled', 0, null]);
  const d = find(res, `project:${proj}:deploy`);
  assert.deepStrictEqual([d.source, d.scope, d.invoke, d.state], ['project', proj, '/deploy', 'on']);
  const pl = find(res, 'plugin:tools@mkt:lint');
  assert.deepStrictEqual([pl.source, pl.scope, pl.invoke, pl.locked, pl.state], ['plugin', 'tools@mkt', '/tools:lint', 'plugin', 'on']);
  assert.strictEqual(find(res, 'plugin:other@mkt:fmt').state, 'off');
  assert.strictEqual(find(res, 'plugin:other@mkt:fmt').listingTokens, 0);
});

test('(b) frontmatter: none, folded, quoted, list, locked', async () => {
  const bare = find(res, 'personal:bare');
  assert.deepStrictEqual([bare.name, bare.description, bare.whenToUse], ['bare', '', '']);
  assert.ok(bare.bodyTokens > 0 && bare.listingTokens > 0);
  assert.strictEqual(find(res, 'personal:folded').description, 'First line of text second line of text\nnew paragraph');
  const q = find(res, 'personal:quoted');
  assert.deepStrictEqual([q.name, q.description, q.whenToUse, q.invoke], ['quoted-name', "It's quoted", 'Say "hi"', '/quoted-name']);
  const l = find(res, 'personal:locked');
  assert.deepStrictEqual([l.locked, l.modelInvocable, l.userInvocable, l.listingTokens], ['frontmatter', false, true, 0]);
  const pr = find(res, 'personal:pr-review');
  assert.strictEqual(pr.bodyTokens, Math.ceil(fs.readFileSync(path.join(pr.dir, 'SKILL.md'), 'utf8').length / 4));
});

test('(c) precedence: project local beats user, settingsFile recorded', async () => {
  const user = find(res, 'personal:pr-review');
  assert.deepStrictEqual([user.state, user.settingsFile], ['name-only', path.join(claude, 'settings.json')]);
  assert.strictEqual(user.listingTokens, Math.ceil('- pr-review'.length / 4));
  const pj = find(res, `project:${proj}:pr-review`);
  assert.deepStrictEqual([pj.state, pj.settingsFile, pj.listingTokens], ['off', path.join(proj, '.claude', 'settings.local.json'), 0]);
});

test('(d) setState off writes override, keeps unrelated keys, tokens and totals update', async () => {
  const before = await skills1.list(opts.projectDirs);
  const target = find(before, 'personal:folded');
  const next = await skills1.setState({ id: 'personal:folded', state: 'off' }, opts.projectDirs);
  const json = readJson(path.join(claude, 'settings.json'));
  assert.strictEqual(json.model, 'opus');
  assert.strictEqual(json.skillOverrides.folded, 'off');
  assert.strictEqual(json.skillOverrides['pr-review'], 'name-only');
  assert.deepStrictEqual(json.enabledPlugins['unrelated@x'], true);
  const row = find(next, 'personal:folded');
  assert.deepStrictEqual([row.state, row.listingTokens], ['off', 0]);
  assert.strictEqual(next.totals.listingTokens, before.totals.listingTokens - target.listingTokens);
  assert.strictEqual(next.totals.off, before.totals.off + 1);
  assert.strictEqual(next.totals.on, before.totals.on - 1);
  assert.ok(!fs.readdirSync(path.dirname(path.join(claude, 'settings.json'))).some((f) => f.endsWith('.tmp')));
});

test('(d2) project skill writes to settings.local.json, not the user file', async () => {
  const next = await skills1.setState({ id: `project:${proj}:deploy`, state: 'user-invocable-only' }, []);
  const row = find(next, `project:${proj}:deploy`);
  assert.deepStrictEqual([row.state, row.modelInvocable, row.userInvocable, row.listingTokens], ['user-invocable-only', false, true, 0]);
  assert.strictEqual(readJson(path.join(proj, '.claude', 'settings.local.json')).skillOverrides.deploy, 'user-invocable-only');
  assert.ok(!('deploy' in (readJson(path.join(claude, 'settings.json')).skillOverrides || {})));
  await skills1.setState({ id: `project:${proj}:deploy`, state: 'on' }, []);
});

test('(e) setState on removes key and the emptied skillOverrides', async () => {
  await skills1.setState({ id: 'personal:pr-review', state: 'on' }, []);
  let json = readJson(path.join(claude, 'settings.json'));
  assert.deepStrictEqual(Object.keys(json.skillOverrides), ['folded']);
  await skills1.setState({ id: 'personal:folded', state: 'on' }, []);
  json = readJson(path.join(claude, 'settings.json'));
  assert.ok(!('skillOverrides' in json));
  assert.strictEqual(json.model, 'opus');
  assert.strictEqual(json.enabledPlugins['tools@mkt'], true);
  const local = path.join(proj, '.claude', 'settings.local.json');
  await skills1.setState({ id: `project:${proj}:pr-review`, state: 'on' }, []);
  const lj = readJson(local);
  assert.deepStrictEqual(lj, { permissions: { allow: ['Bash(ls)'] } });
});

test('(f) setPlugin flips one enabledPlugins key only', async () => {
  const next = await skills1.setPlugin({ id: 'plugin:tools@mkt:lint', enabled: false }, []);
  const json = readJson(path.join(claude, 'settings.json'));
  assert.deepStrictEqual(json.enabledPlugins, { 'tools@mkt': false, 'other@mkt': false, 'unrelated@x': true });
  assert.strictEqual(find(next, 'plugin:tools@mkt:lint').state, 'off');
  await skills1.setPlugin({ id: 'other@mkt', enabled: true }, []);
  assert.strictEqual(readJson(path.join(claude, 'settings.json')).enabledPlugins['other@mkt'], true);
  await assert.rejects(() => skills1.setState({ id: 'plugin:tools@mkt:lint', state: 'off' }, []), /plugin/i);
  await assert.rejects(() => skills1.setPlugin({ id: 'nope@x', enabled: true }, []), /not found/);
});

test('(g) restore moves a parked skill and refuses a collision', async () => {
  const next = await skills1.restore({ id: 'parked:old-skill' }, []);
  assert.ok(fs.existsSync(path.join(claude, 'skills', 'old-skill', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(claude, 'skills-disabled', 'old-skill')));
  assert.strictEqual(find(next, 'personal:old-skill').state, 'on');
  await assert.rejects(() => skills1.restore({ id: 'parked:collide' }, []), /already exists/);
  assert.ok(fs.existsSync(path.join(claude, 'skills-disabled', 'collide', 'SKILL.md')));
  await assert.rejects(() => skills1.restore({ id: 'parked:../skills' }, []), /not found/);
});

const realTmp = fs.realpathSync(tmp);
test('(i) absolute and relative symlinked skills resolve; dir is the real folder; warning per link', async () => {
  skill(path.join(tmp, 'elsewhere', 'abs-target'), 'description: Linked by absolute path');
  skill(path.join(home, '.agents', 'skills', 'rel-target'), 'description: Linked by relative path');
  fs.symlinkSync(path.join(tmp, 'elsewhere', 'abs-target'), path.join(claude, 'skills', 'abs-link'));
  fs.symlinkSync('../../.agents/skills/rel-target', path.join(claude, 'skills', 'rel-link'));
  const r = await skills1.list(opts.projectDirs);
  const abs = find(r, 'personal:abs-link');
  assert.deepStrictEqual([abs.symlink, abs.dir, abs.description, abs.source], [true, path.join(realTmp, 'elsewhere', 'abs-target'), 'Linked by absolute path', 'personal']);
  const rel = find(r, 'personal:rel-link');
  assert.deepStrictEqual([rel.symlink, rel.dir, rel.description], [true, path.join(realTmp, 'home', '.agents', 'skills', 'rel-target'), 'Linked by relative path']);
  assert.strictEqual(find(r, 'personal:bare').symlink, false);
  const notes = r.warnings.filter((w) => w.includes('is a link to'));
  assert.strictEqual(notes.length, 2);
  assert.ok(notes.some((w) => w.includes(rel.dir) && /may skip/.test(w)));
  // Linked skill toggles, keyed by name.
  const off = await skills1.setState({ id: 'personal:rel-link', state: 'off' }, []);
  assert.strictEqual(find(off, 'personal:rel-link').state, 'off');
  await skills1.setState({ id: 'personal:rel-link', state: 'on' }, []);
});

test('(j) broken link and link loop warn and are skipped', async () => {
  fs.symlinkSync(path.join(tmp, 'does-not-exist'), path.join(claude, 'skills', 'dead-link'));
  fs.symlinkSync(path.join(claude, 'skills', 'loop-b'), path.join(claude, 'skills', 'loop-a'));
  fs.symlinkSync(path.join(claude, 'skills', 'loop-a'), path.join(claude, 'skills', 'loop-b'));
  const r = await skills1.list(opts.projectDirs);
  const joined = r.warnings.join('\n');
  assert.match(joined, /dead-link: broken link/);
  assert.match(joined, /loop-a: link loops back/);
  assert.ok(!find(r, 'personal:dead-link') && !find(r, 'personal:loop-a'));
});

test('(k) commands from home and project are discovered and toggleable', async () => {
  write(path.join(claude, 'commands', 'conductor-add.md'), '---\ndescription: Add a workspace\nargument-hint: "[name]"\n---\nDo it.\n');
  write(path.join(claude, 'commands', 'ns', 'nested.md'), 'No frontmatter body\n');
  write(path.join(claude, 'commands', 'notes.txt'), 'ignored');
  write(path.join(proj, '.claude', 'commands', 'ship.md'), '---\nname: ship-it\ndescription: Ship\n---\nGo.\n');
  let r = await skills1.list(opts.projectDirs);
  const c = find(r, 'command:conductor-add');
  assert.deepStrictEqual([c.source, c.scope, c.invoke, c.dir, c.userInvocable, c.description, c.state], ['command', '~/.claude/commands', '/conductor-add', path.join(claude, 'commands'), true, 'Add a workspace', 'on']);
  assert.ok(c.listingTokens > 0 && c.bodyTokens > 0);
  const n = find(r, 'command:ns/nested');
  assert.deepStrictEqual([n.name, n.dir], ['nested', path.join(claude, 'commands', 'ns')]);
  assert.ok(!r.skills.some((x) => x.name === 'notes'));
  const p = find(r, `project-command:${proj}:ship`);
  assert.deepStrictEqual([p.source, p.scope, p.name, p.invoke, p.dir], ['command', proj, 'ship-it', '/ship-it', path.join(proj, '.claude', 'commands')]);
  r = await skills1.setState({ id: 'command:conductor-add', state: 'off' }, []);
  assert.strictEqual(find(r, 'command:conductor-add').state, 'off');
  assert.strictEqual(find(r, 'command:conductor-add').userInvocable, false);
  assert.strictEqual(readJson(path.join(claude, 'settings.json')).skillOverrides['conductor-add'], 'off');
  r = await skills1.setState({ id: `project-command:${proj}:ship`, state: 'name-only' }, []);
  assert.strictEqual(readJson(path.join(proj, '.claude', 'settings.local.json')).skillOverrides['ship-it'], 'name-only');
  assert.strictEqual(find(r, `project-command:${proj}:ship`).settingsFile, path.join(proj, '.claude', 'settings.local.json'));
  await skills1.setState({ id: 'command:conductor-add', state: 'on' }, []);
  await skills1.setState({ id: `project-command:${proj}:ship`, state: 'on' }, []);
  assert.ok(!('skillOverrides' in readJson(path.join(claude, 'settings.json'))));
});

test('(l) stale plugin cache versions are not duplicated; newest lastUpdated entry wins', async () => {
  const cache = path.join(claude, 'plugins', 'cache', 'mkt', 'multi');
  for (const v of ['0.1.0', '0.2.0', '0.3.0', '1.0.0', '2.0.0']) skill(path.join(cache, v, 'skills', `s-${v}`), `description: version ${v}`);
  write(path.join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: {
      'multi@mkt': [
        { scope: 'user', installPath: path.join(cache, '1.0.0'), version: '1.0.0', lastUpdated: '2026-01-01T00:00:00Z' },
        { scope: 'project', installPath: path.join(cache, '2.0.0'), version: '2.0.0', lastUpdated: '2026-06-01T00:00:00Z' },
      ],
      'bare@mkt': [{ scope: 'user', version: '1.0.0' }],
    },
  }));
  // Sibling plugin in the checkout must not leak.
  skill(path.join(claude, 'plugins', 'marketplaces', 'mkt', 'plugins', 'bare', 'skills', 'from-market'), 'description: market');
  skill(path.join(claude, 'plugins', 'marketplaces', 'mkt', 'plugins', 'unlisted', 'skills', 'nope'), 'description: not installed');
  const r = await skills1.list(opts.projectDirs);
  const multi = r.skills.filter((x) => x.scope === 'multi@mkt');
  assert.deepStrictEqual(multi.map((x) => x.name), ['s-2.0.0']);
  assert.deepStrictEqual(r.skills.filter((x) => x.scope === 'bare@mkt').map((x) => x.name), ['from-market']);
  assert.ok(!r.skills.some((x) => x.name === 'nope'));
  assert.ok(!r.skills.some((x) => /^s-(0\.|1\.)/.test(x.name)));
});

// Second fake home, untouched by earlier mutations.
const home2 = path.join(tmp, 'home2');
const proj2 = path.join(tmp, 'proj2');
const claude2 = path.join(home2, '.claude');
const opts2 = { home: home2, projectDirs: [proj2] };
const skills2 = client(home2);

test('(m) the listing is priced against the caps Claude Code applies, not a raw sum', async () => {
  // One huge description plus enough to overflow.
  skill(path.join(claude2, 'skills', 'verbose'), `name: verbose\ndescription: ${'d'.repeat(4000)}`);
  for (let i = 0; i < 20; i++) {
    skill(path.join(claude2, 'skills', `bulk-${i}`), `name: bulk-${i}\ndescription: ${'e'.repeat(400)}`);
  }
  const r = await skills2.list(opts2.projectDirs);
  const v = find(r, 'personal:verbose');
  // Listing line; description cut at 1536.
  assert.strictEqual(v.listingChars, 'verbose'.length + 4 + 1536, 'long description is capped');
  assert.ok(v.listingChars < 4000, 'the cap is what keeps it from being priced at its full length');
  assert.ok(r.totals.overBudget, 'this many skills is over the listing budget');
  assert.strictEqual(r.totals.budgetChars, 8000);
  assert.strictEqual(
    r.totals.effectiveTokens,
    r.totals.budgetTokens,
    'over budget, the real cost is the budget, not the sum'
  );
  assert.ok(r.totals.listingTokens > r.totals.effectiveTokens, 'the uncapped sum is reported separately');

  // Turning skills off fits it again.
  for (let i = 0; i < 20; i++) await skills2.setState({ id: `personal:bulk-${i}`, state: 'off' }, []);
  const r2 = await skills2.list(opts2.projectDirs);
  assert.ok(!r2.totals.overBudget, 'pruning brings the listing back under budget');
  assert.strictEqual(r2.totals.effectiveTokens, r2.totals.listingTokens, 'under budget the sum is the cost');
});

test('(n) turning a skill back on beats an override in a lower settings file', async () => {
  skill(path.join(proj2, '.claude', 'skills', 'shared'), 'name: shared\ndescription: Shared skill');
  write(path.join(claude2, 'settings.json'), JSON.stringify({ skillOverrides: { shared: 'off' } }, null, 2));
  write(path.join(proj2, '.claude', 'settings.local.json'), JSON.stringify({ skillOverrides: { shared: 'name-only' } }, null, 2));

  const after = await skills2.setState({ id: `project:${proj2}:shared`, state: 'on' }, [proj2]);
  const row = find(after, `project:${proj2}:shared`);
  assert.strictEqual(row.state, 'on', 'the row really reads as on, not snapped back by the user file');
  const local = readJson(path.join(proj2, '.claude', 'settings.local.json'));
  assert.strictEqual(local.skillOverrides.shared, 'on', 'an explicit on is written to outrank the lower file');
  assert.strictEqual(readJson(path.join(claude2, 'settings.json')).skillOverrides.shared, 'off', 'the other file is left alone');
});

test('(o) a settings file with a byte order mark or no content is still usable', async () => {
  skill(path.join(claude2, 'skills', 'bom-test'), 'name: bom-test\ndescription: Bom test');
  write(path.join(claude2, 'settings.json'), '\uFEFF' + JSON.stringify({ model: 'opus' }, null, 2));
  let r = await skills2.list(opts2.projectDirs);
  assert.ok(!r.warnings.some((w) => /settings\.json is not valid JSON/.test(w)), 'a byte order mark is not a parse error');
  await skills2.setState({ id: 'personal:bom-test', state: 'off' }, []);
  assert.strictEqual(readJson(path.join(claude2, 'settings.json')).model, 'opus', 'unrelated keys survive');
  assert.strictEqual(readJson(path.join(claude2, 'settings.json')).skillOverrides['bom-test'], 'off');

  write(path.join(claude2, 'settings.json'), '   \n');
  await skills2.setState({ id: 'personal:bom-test', state: 'off' }, []);
  assert.strictEqual(readJson(path.join(claude2, 'settings.json')).skillOverrides['bom-test'], 'off', 'an empty file is an empty object');
});

test('(p) a project file that overrides a personal skill or a plugin is called out', async () => {
  skill(path.join(claude2, 'skills', 'shadowed'), 'name: shadowed\ndescription: Shadowed skill');
  write(path.join(claude2, 'settings.json'), JSON.stringify({ skillOverrides: { shadowed: 'on' }, enabledPlugins: { 'p1@mkt': true } }, null, 2));
  const plugRoot = path.join(claude2, 'plugins', 'cache', 'mkt', 'p1', '1.0.0');
  skill(path.join(plugRoot, 'skills', 'thing'), 'description: A plugin thing');
  write(path.join(claude2, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'p1@mkt': [{ scope: 'user', installPath: plugRoot, version: '1.0.0' }] },
  }));
  write(path.join(proj2, '.claude', 'settings.json'), JSON.stringify({
    skillOverrides: { shadowed: 'off' },
    enabledPlugins: { 'p1@mkt': false },
  }, null, 2));

  const r = await skills2.list(opts2.projectDirs);
  const joined = r.warnings.join('\n');
  assert.match(joined, /"shadowed" is off in .*proj2/, 'a project override of a personal skill is reported');
  assert.match(joined, /Plugin p1@mkt is off in .*proj2/, 'a project override of a plugin is reported');
  assert.strictEqual(find(r, 'personal:shadowed').state, 'on', 'the row still shows the user level state');
});

test('(h) missing SKILL.md, oversized file, bad JSON warn without throwing', async () => {
  write(path.join(claude, 'skills', 'broken-json-skill', 'SKILL.md'), '---\ndescription: ok\n---\n');
  write(path.join(proj, '.claude', 'settings.json'), '{ not json');
  const r = await skills1.list(opts.projectDirs);
  const joined = r.warnings.join('\n');
  assert.match(joined, /empty-dir: no SKILL\.md/);
  assert.match(joined, /huge[\\/]SKILL\.md: larger than 1 MB/);
  assert.match(joined, /settings\.json is not valid JSON/);
  assert.match(joined, /missing-project/);
  assert.ok(!find(r, 'personal:huge') && !find(r, 'personal:empty-dir'));
  // a malformed settings file is never rewritten
  write(path.join(proj, '.claude', 'settings.local.json'), '{ nope');
  await assert.rejects(() => skills1.setState({ id: `project:${proj}:deploy`, state: 'off' }, []), /left unchanged/);
  assert.strictEqual(fs.readFileSync(path.join(proj, '.claude', 'settings.local.json'), 'utf8'), '{ nope');
  const empty = await client(path.join(tmp, 'nothing')).list([]);
  assert.deepStrictEqual(empty.skills, []);
});


afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
