// Settings phone panel: pairing QR, gateway status, token rotation.

import type { PairingInfo, PairingStatus } from "../shared/mobile.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { messageOf } from "./errors.ts"
import { qrSvg } from "./qr.ts"

const REFRESH_MS = 5000

type View = { readonly kind: "loading" } | { readonly kind: "failed"; readonly message: string } | { readonly kind: "ready"; readonly status: PairingStatus }

let view: View = { kind: "loading" }
let confirming = false
let busy = false
let timer: ReturnType<typeof setInterval> | null = null

const host = () => $("#phone-panel")

const statusText = (info: PairingInfo) => {
  if (info.listening && info.host) {
    return `Listening on ${info.host}:${info.port}`
  }
  return info.error ?? "Starting"
}

const certText = (info: PairingInfo) =>
  info.certExpiresAt === null
    ? "No certificate yet"
    : `Certificate valid until ${new Date(info.certExpiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`

const pushText = (info: PairingInfo) =>
  info.apnsMissing.length ? `Push notifications are off. Missing from gateway.json: ${info.apnsMissing.join(", ")}` : "Push notifications on"

const run = async (action: () => Promise<PairingInfo>) => {
  busy = true
  confirming = false
  render()
  try {
    view = { kind: "ready", status: await action() }
  } catch (err) {
    view = { kind: "failed", message: messageOf(err) }
  }
  busy = false
  render()
}

const button = (label: string, cls: string, onClick: () => void) => {
  const b = el("button", cls, label)
  b.type = "button"
  b.disabled = busy
  b.onclick = onClick
  return b
}

const setupCard = () => {
  const card = el("div", "card")
  card.append(
    el("div", "card-title", "Phone"),
    el("div", "hint", "Control your sessions from the Daycare iPhone app over Tailscale. Setting up creates a pairing code and starts the phone gateway on this Mac."),
  )
  const actions = el("div", "inline-actions")
  actions.append(button("Set up phone", "primary small", () => void run(api.phoneSetup)))
  card.append(actions)
  return card
}

const qrBox = (info: PairingInfo) => {
  const box = el("div", "phone-qr")
  if (!info.url) {
    box.append(el("div", "hint", "The QR code appears once Tailscale reports this Mac's name."))
    return box
  }
  box.append(qrSvg(info.url))
  return box
}

const rotateActions = () => {
  const actions = el("div", "inline-actions")
  if (!confirming) {
    actions.append(
      button("New pairing code", "ghost", () => {
        confirming = true
        render()
      }),
      el("span", "hint", "Paired phones are disconnected and must scan the new code."),
    )
    return actions
  }
  actions.append(
    button("Disconnect phones and rotate", "primary small", () => void run(api.phoneRotate)),
    button("Cancel", "ghost", () => {
      confirming = false
      render()
    }),
  )
  return actions
}

const pairedCard = (info: PairingInfo) => {
  const card = el("div", "card")
  card.append(el("div", "card-title", "Pair a phone"), el("div", "hint", "Open the Daycare app on your iPhone and scan this code. Tailscale must be on for both devices."))
  const body = el("div", "phone-body")
  const details = el("div", "phone-details")
  details.append(
    el("div", info.error && !info.listening ? "phone-status error" : "phone-status", statusText(info)),
    el("div", "hint", info.host ? `${info.host}, port ${info.port}` : `Port ${info.port}`),
    el("div", "hint", certText(info)),
    el("div", "hint", pushText(info)),
  )
  if (info.error && info.listening) {
    details.append(el("div", "phone-status error", info.error))
  }
  body.append(qrBox(info), details)
  card.append(body, rotateActions())
  return card
}

const render = () => {
  switch (view.kind) {
    case "loading":
      host().replaceChildren(el("div", "hint", "Checking the phone gateway"))
      return
    case "failed": {
      const card = el("div", "card")
      card.append(el("div", "card-title", "Phone"), el("div", "phone-status error", view.message))
      host().replaceChildren(card)
      return
    }
    case "ready":
      host().replaceChildren(view.status ? pairedCard(view.status) : setupCard())
      return
  }
}

// Skips redraws when nothing changed
const changed = (next: PairingStatus) => view.kind !== "ready" || JSON.stringify(view.status) !== JSON.stringify(next)

const refresh = async () => {
  if (busy) {
    return
  }
  try {
    const status = await api.phonePairing()
    if (changed(status)) {
      view = { kind: "ready", status }
      render()
    }
  } catch (err) {
    view = { kind: "failed", message: messageOf(err) }
    render()
  }
}

export const showPhone = () => {
  confirming = false
  render()
  void refresh()
  timer ??= setInterval(() => void refresh(), REFRESH_MS)
}

export const hidePhone = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
