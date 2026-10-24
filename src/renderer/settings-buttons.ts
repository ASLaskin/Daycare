// Settings top buttons card.

import type { BuiltinButton, CustomButton } from "../shared/topButtons.ts"
import { $, el } from "./dom.ts"
import { input, onToggle } from "./fields.ts"
import { fileManagerName } from "./platform.ts"
import { saveSettings, settings } from "./store.ts"

const BUILTIN: ReadonlyArray<BuiltinButton> = ["vscode", "github", "finder"]

const updateButton = (i: number, patch: Partial<CustomButton>) =>
  saveSettings({ customButtons: settings().customButtons.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

const customRow = (b: CustomButton, i: number) => {
  const row = el("div", "custom-button-row")
  const label = el("input")
  label.placeholder = "Label"
  label.value = b.label
  label.onchange = () => updateButton(i, { label: label.value.trim() || b.label })
  const command = el("input", "mono")
  command.placeholder = "Shell command"
  command.spellcheck = false
  command.value = b.command
  command.onchange = () => updateButton(i, { command: command.value.trim() || b.command })
  const remove = el("button", "ghost", "Remove")
  remove.onclick = () => saveSettings({ customButtons: settings().customButtons.filter((_, j) => j !== i) })
  row.append(label, command, remove)
  return row
}

export const renderButtons = () => {
  const { hiddenButtons, customButtons } = settings()
  BUILTIN.forEach((id) => {
    input(`set-button-${id}`).checked = !hiddenButtons.includes(id)
  })
  $("#set-button-finder-label").textContent = fileManagerName
  $("#custom-button-rows").replaceChildren(...customButtons.map(customRow))
}

export const wireButtons = () => {
  BUILTIN.forEach((id) =>
    onToggle(`set-button-${id}`, (shown) => {
      const others = settings().hiddenButtons.filter((h) => h !== id)
      saveSettings({ hiddenButtons: shown ? others : [...others, id] })
    }),
  )
  $("#add-custom-button").onclick = () =>
    saveSettings({ customButtons: [...settings().customButtons, { label: "Run", command: "echo hello" }] })
}
