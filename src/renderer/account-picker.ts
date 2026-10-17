// Active account picker beside plan usage.

import { activeAccountOf, allAccounts } from "../shared/accounts.ts"
import { asAccountId } from "../shared/ids.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { messageOf } from "./errors.ts"
import { applySettings, onSettingsChanged, settings } from "./store.ts"
import { toast } from "./toast.ts"

const picker = () => $<HTMLSelectElement>("#account-picker")

const renderPicker = () => {
  const s = settings()
  const select = picker()
  select.classList.toggle("hidden", !s.accounts.length)
  select.replaceChildren(
    ...allAccounts(s.accounts).map((a) => {
      const o = el("option", null, a.label)
      o.value = a.id
      return o
    }),
  )
  select.value = activeAccountOf(s)
}

// Main may ask about running sessions; cancel puts the old value back
const pick = async (id: string) => {
  try {
    applySettings(await api.switchAccount(asAccountId(id)))
  } catch (err) {
    toast(messageOf(err))
  }
  renderPicker()
}

export const initAccountPicker = () => {
  const select = picker()
  // Keeps clicks from refreshing usage
  select.onclick = (e) => e.stopPropagation()
  select.onchange = () => pick(select.value)
  renderPicker()
  onSettingsChanged(renderPicker)
}
