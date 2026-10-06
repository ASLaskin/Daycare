# Anti slop

Rules for all code you write or edit. Fix violations you touch.

## No section banners

Never write divider comments that label regions of a file.

```ts
// ---------- pacing ----------
// ===== helpers =====
/* ********** types ********** */
```

If a file needs sections, it needs to be split into modules instead.

## Modular files

- One file, one responsibility. Unrelated logic goes in separate files.
- No huge files mixing types, helpers, services, and handlers.
- When a file grows a second concern, extract it into its own module.

## Conditionals

- Never use `else if`. Use early returns, a lookup map, or `switch`.
- Every `if` body gets braces, with logic on its own line.

```ts
// Bad
if (typeof raw !== "object" || raw === null) return defaults

// Good
if (typeof raw !== "object" || raw === null) {
  return defaults
}
```

## Branded types

Use branded types for domain primitives, mainly strings (ids, paths, tokens).

```ts
type SessionId = string & { readonly __brand: "SessionId" }
```

Never pass a raw `string` where a branded type exists.

## No any or unknown

- Never use `any` or `unknown` unless absolutely necessary.
- At untyped boundaries (JSON, IPC, external input), decode into a real type immediately.

## Prefer array methods over loops

- Use `.map`, `.filter`, `.reduce`, `.flatMap` instead of `for` loops when possible.
- Keep a loop only when an array method genuinely cannot express it.

```ts
// Bad
const ids = []
for (const s of sessions) {
  ids.push(s.id)
}

// Good
const ids = sessions.map((s) => s.id)
```

## Comments

- Comments say **what**, never how or why.
- About 10 words or less.
- No comments restating obvious code. Skip the comment if the name already says it.

```ts
// Bad: Loop through sessions and check each because the worker may have died
// Good: Remove dead worker sessions
```
