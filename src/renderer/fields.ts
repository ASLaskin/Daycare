// Settings form helpers and pickers.

import { $, el } from "./dom.ts"

export const input = (id: string) => $<HTMLInputElement>(`#${id}`)
export const select = (id: string) => $<HTMLSelectElement>(`#${id}`)

export const onSelect = (id: string, save: (value: string) => void) => {
  select(id).onchange = (e) => save((e.target as HTMLSelectElement).value)
}

export const onToggle = (id: string, save: (checked: boolean) => void) => {
  input(id).onchange = (e) => save((e.target as HTMLInputElement).checked)
}

export interface Choice<T extends string> {
  readonly id: T
  readonly label: string
  readonly sub?: string
}

const pickerButton = <T extends string>(cls: string | null, it: Choice<T>, current: string, onPick: (id: T) => void) => {
  const b = el("button", cls)
  b.type = "button"
  b.setAttribute("aria-pressed", String(it.id === current))
  b.onclick = () => onPick(it.id)
  return b
}

export const segPicker = <T extends string>(host: HTMLElement, items: ReadonlyArray<Choice<T>>, current: string, onPick: (id: T) => void) => {
  host.replaceChildren(
    ...items.map((it) => {
      const b = pickerButton(null, it, current, onPick)
      b.textContent = it.label
      return b
    }),
  )
}

export const choicePicker = <T extends string>(
  host: HTMLElement,
  items: ReadonlyArray<Choice<T>>,
  current: string,
  onPick: (id: T) => void,
  decorate: (b: HTMLButtonElement, it: Choice<T>) => void,
) => {
  host.replaceChildren(
    ...items.map((it) => {
      const b = pickerButton("choice", it, current, onPick)
      decorate(b, it)
      b.append(el("span", "choice-label", it.label))
      if (it.sub) {
        b.append(el("span", "choice-sub", it.sub))
      }
      return b
    }),
  )
}
