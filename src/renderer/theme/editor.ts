// Theme editor: name, actions, and a colour row per token.

import { asThemeId } from "../../shared/ids.ts"
import { parseHex } from "../../shared/theme/color.ts"
import type { Palette, ThemeToken } from "../../shared/theme/palette.ts"
import { activeTheme, type ThemeState } from "../../shared/theme/themes.ts"
import { el } from "../dom.ts"
import { saveSettings, settings } from "../store.ts"
import { previewPalette } from "./apply.ts"
import { deleteCustom, discardDraft, MAX_NAME, renameActive, saveDraft, setColor, startDraft, type ThemePatch } from "./edits.ts"
import { randomTheme } from "./random.ts"
import { TOKEN_GROUPS } from "./token-groups.ts"

const NOTES = {
  builtin: "Built in. Changing a colour starts an unsaved copy.",
  custom: "Your preset. Changes save as you go.",
  draft: "Not saved yet. Save it to keep it as a preset.",
} as const

interface ColorRow {
  readonly token: ThemeToken
  readonly swatch: HTMLInputElement
  readonly hex: HTMLInputElement
}

interface EditorView {
  readonly title: HTMLElement
  readonly name: HTMLInputElement
  readonly note: HTMLElement
  readonly discard: HTMLButtonElement
  readonly remove: HTMLButtonElement
  readonly save: HTMLButtonElement
  readonly rows: ReadonlyArray<ColorRow>
}

let view: EditorView | null = null

const edit = (change: (s: ThemeState) => ThemePatch) => {
  const patch = change(settings())
  if (Object.keys(patch).length === 0) {
    renderThemeEditor(settings())
    return
  }
  void saveSettings(patch)
}

const commitColor = (row: ColorRow, text: string) => {
  const color = parseHex(text)
  const current = activeTheme(settings()).palette[row.token]
  if (!color || color === current) {
    row.hex.value = current
    return
  }
  edit((s) => setColor(s, row.token, color))
}

const colorRow = (token: ThemeToken, label: string) => {
  const swatch = el("input", "theme-swatch")
  swatch.type = "color"
  swatch.id = `theme-${token}`
  const name = el("label", "theme-row-label", label)
  name.htmlFor = swatch.id
  const hex = el("input", "theme-hex")
  hex.spellcheck = false
  hex.maxLength = 7
  hex.setAttribute("aria-label", `${label} hex`)
  const row: ColorRow = { token, swatch, hex }
  swatch.oninput = () => {
    const color = parseHex(swatch.value)
    if (color) {
      previewPalette({ ...activeTheme(settings()).palette, [token]: color })
      hex.value = color
    }
  }
  swatch.onchange = () => commitColor(row, swatch.value)
  hex.onchange = () => commitColor(row, hex.value)
  hex.onkeydown = (e) => {
    if (e.key === "Enter") {
      hex.blur()
    }
  }
  const node = el("div", "theme-row")
  node.append(swatch, name, hex)
  return { node, row }
}

const button = (cls: string, text: string, onClick: () => void) => {
  const b = el("button", cls, text)
  b.type = "button"
  b.onclick = onClick
  return b
}

const randomize = () => {
  const theme = randomTheme()
  edit((s) => startDraft(s, theme.name, theme.palette))
}

export const mountThemeEditor = (host: HTMLElement) => {
  const title = el("span", "theme-title")
  const name = el("input", "theme-name")
  name.maxLength = MAX_NAME
  name.setAttribute("aria-label", "Theme name")
  name.onchange = () => edit((s) => renameActive(s, name.value))
  name.onkeydown = (e) => {
    if (e.key === "Enter") {
      name.blur()
    }
  }
  const discard = button("ghost", "Discard", () => edit(discardDraft))
  const remove = button("ghost", "Delete", () => edit((s) => deleteCustom(s, activeTheme(s).id)))
  const save = button("primary small", "Save preset", () => edit((s) => saveDraft(s, asThemeId(`custom-${crypto.randomUUID()}`))))
  const actions = el("div", "inline-actions")
  actions.append(button("ghost", "Randomize", randomize), discard, remove, save)
  const head = el("div", "theme-head")
  head.append(title, name, actions)
  const note = el("div", "hint")

  const groups = TOKEN_GROUPS.map((g) => {
    const built = g.tokens.map(([token, label]) => colorRow(token, label))
    const group = el("div", "theme-group")
    const grid = el("div", "theme-rows")
    grid.append(...built.map((b) => b.node))
    group.append(el("div", "theme-group-title", g.label), grid)
    return { group, rows: built.map((b) => b.row) }
  })
  host.replaceChildren(head, note, ...groups.map((g) => g.group))
  view = { title, name, note, discard, remove, save, rows: groups.flatMap((g) => g.rows) }
}

const setUnlessFocused = (input: HTMLInputElement, value: string) => {
  if (document.activeElement !== input && input.value !== value) {
    input.value = value
  }
}

const renderRows = (rows: ReadonlyArray<ColorRow>, palette: Palette) =>
  rows.forEach((r) => {
    setUnlessFocused(r.swatch, palette[r.token])
    setUnlessFocused(r.hex, palette[r.token])
  })

export const renderThemeEditor = (s: ThemeState) => {
  if (!view) {
    return
  }
  const theme = activeTheme(s)
  view.title.textContent = theme.name
  view.title.classList.toggle("hidden", theme.kind !== "builtin")
  view.name.classList.toggle("hidden", theme.kind === "builtin")
  setUnlessFocused(view.name, theme.name)
  view.note.textContent = NOTES[theme.kind]
  view.discard.classList.toggle("hidden", theme.kind !== "draft")
  view.save.classList.toggle("hidden", theme.kind !== "draft")
  view.remove.classList.toggle("hidden", theme.kind !== "custom")
  renderRows(view.rows, theme.palette)
}
