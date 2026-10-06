// Settings layout panel.

import { SIDEBAR_WIDTH } from "./appearance.ts"
import { $ } from "./dom.ts"
import { choicePicker, input, onSelect, onToggle, select } from "./fields.ts"
import { getActiveMaster } from "./focus.ts"
import { currentLayout, LAYOUTS, relayoutAll, setLayout, splitFor } from "./layout.ts"
import { layoutDiagram } from "./layout-picker.ts"
import { workersOf } from "./state.ts"
import { saveSettings, settings } from "./store.ts"
import { toast } from "./toast.ts"

const RESET_SIZES = { splits: {}, sidebarWidth: SIDEBAR_WIDTH, railWidth: 252, stageGap: 10, maxCols: 4 }

export const renderLayoutPanel = () => {
  const s = settings()
  const layout = currentLayout()
  choicePicker($("#layout-grid"), LAYOUTS, layout, setLayout, (b, it) => b.append(layoutDiagram(it.id)))
  const split = input("set-split")
  const active = getActiveMaster()
  const workers = active ? workersOf(active).length : 1
  const grid = layout === "grid"
  split.disabled = grid
  split.value = String(splitFor(layout, Math.max(1, workers)))
  $("#split-val").textContent = grid ? "even" : `${split.value}%`
  input("set-zoom-dblclick").checked = s.zoomDblClick
  select("set-max-cols").value = String(s.maxCols || 4)
  select("set-stage-gap").value = String(s.stageGap || 10)
}

const wireSplit = () => {
  const split = input("set-split")
  split.oninput = () => {
    $("#split-val").textContent = `${split.value}%`
    document.querySelectorAll<HTMLElement>(".group").forEach((g) => g.style.setProperty("--split", `${split.value}%`))
  }
  split.onchange = () =>
    saveSettings({ splits: { ...settings().splits, [currentLayout()]: Number(split.value) } }).then(relayoutAll)
}

export const wireLayoutPanel = () => {
  wireSplit()
  onToggle("set-zoom-dblclick", (zoomDblClick) => saveSettings({ zoomDblClick }))
  onSelect("set-max-cols", (v) => saveSettings({ maxCols: Number(v) }).then(relayoutAll))
  onSelect("set-stage-gap", (v) => saveSettings({ stageGap: Number(v) }).then(relayoutAll))
  $("#reset-layout").onclick = () =>
    saveSettings(RESET_SIZES).then(() => {
      relayoutAll()
      toast("Sizes reset")
    })
}
