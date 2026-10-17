// Settings accounts panel: add, remove, and log in.

import { type AccountStatus, allAccounts, DEFAULT_ACCOUNT, type LoginProgress } from "../shared/accounts.ts"
import type { AccountId } from "../shared/ids.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { messageOf } from "./errors.ts"
import { applySettings, saveSettings, settings } from "./store.ts"
import { toast } from "./toast.ts"

let statuses = new Map<AccountId, AccountStatus>()
const logins = new Map<AccountId, LoginProgress>()

export const refreshAccounts = async () => {
  statuses = new Map((await api.listAccounts()).map((a) => [a.id, a]))
  renderAccounts()
}

const statusText = (id: AccountId) => {
  const s = statuses.get(id)
  if (!s) {
    return "Checking"
  }
  if (!s.loggedIn) {
    return "Not logged in"
  }
  return s.email ?? "Logged in"
}

const rename = (id: AccountId, label: string) =>
  saveSettings({ accounts: settings().accounts.map((a) => (a.id === id ? { ...a, label: label.trim() || a.label } : a)) })

const remove = async (id: AccountId) => {
  try {
    applySettings(await api.removeAccount(id))
    void refreshAccounts()
  } catch (err) {
    toast(messageOf(err))
  }
}

const startLogin = (id: AccountId) => {
  logins.set(id, { id, phase: "waiting", url: null, message: "Opening your browser" })
  renderAccounts()
  void api.loginAccount(id)
}

const loginGuide = (p: LoginProgress) => {
  const box = el("div", "login-guide")
  box.append(el("div", "hint", `${p.message}. If the page shows a code, paste it here.`))
  const row = el("form", "login-code")
  const code = el("input")
  code.placeholder = "Code from the sign in page"
  code.spellcheck = false
  const submit = el("button", "ghost", "Submit code")
  submit.type = "submit"
  row.onsubmit = (e) => {
    e.preventDefault()
    void api.loginCode(p.id, code.value)
    code.value = ""
  }
  const cancel = el("button", "ghost", "Cancel")
  cancel.type = "button"
  cancel.onclick = () => {
    logins.delete(p.id)
    void api.cancelLogin(p.id)
    renderAccounts()
  }
  const open = el("button", "ghost", "Open sign in page")
  open.type = "button"
  open.disabled = !p.url
  open.onclick = () => {
    if (p.url) {
      void api.openUrl(p.url)
    }
  }
  row.append(code, submit, open, cancel)
  box.append(row)
  return box
}

const accountRow = (id: AccountId, label: string) => {
  const row = el("div", "account-row")
  const name = el("input")
  name.value = label
  name.disabled = id === DEFAULT_ACCOUNT
  name.onchange = () => rename(id, name.value)
  const status = el("span", "account-status", statusText(id))
  const login = el("button", "ghost", statuses.get(id)?.loggedIn ? "Log in again" : "Log in")
  login.disabled = logins.has(id)
  login.onclick = () => startLogin(id)
  const del = el("button", "ghost", "Remove")
  del.disabled = id === DEFAULT_ACCOUNT
  del.onclick = () => remove(id)
  row.append(name, status, login, del)
  const progress = logins.get(id)
  return progress ? [row, loginGuide(progress)] : [row]
}

export const renderAccounts = () => {
  $("#account-rows").replaceChildren(...allAccounts(settings().accounts).flatMap((a) => accountRow(a.id, a.label)))
}

const onLogin = (p: LoginProgress) => {
  if (p.phase === "waiting") {
    logins.set(p.id, p)
    return renderAccounts()
  }
  if (!logins.delete(p.id)) {
    return
  }
  toast(p.phase === "done" ? "Logged in" : p.message)
  void refreshAccounts()
}

export const wireAccounts = () => {
  api.onLogin(onLogin)
  const label = $<HTMLInputElement>("#new-account-label")
  $<HTMLFormElement>("#add-account").onsubmit = async (e) => {
    e.preventDefault()
    const account = await api.addAccount(label.value)
    label.value = ""
    applySettings(await api.getSettings())
    startLogin(account.id)
  }
}
