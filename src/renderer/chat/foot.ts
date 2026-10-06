import { el } from "../dom.ts"
import { settings } from "../store.ts"
import { contextLevel, fmtCost, fmtTokens } from "./format.ts"
import type { ChatSession } from "./types.ts"

const contextMeter = (ctx: number) => {
  const scale = settings().contextScale || 500000
  const level = contextLevel(ctx)
  const wrap = el("span", `chat-foot-ctx ${level}`)
  wrap.title = `${ctx.toLocaleString()} tokens in context`
  const bar = el("span", `meter ${level}`)
  const fill = el("span")
  fill.style.width = `${Math.min(100, Math.max(0, (ctx / scale) * 100))}%`
  bar.append(fill)
  wrap.append(bar, el("span", "chat-foot-num", `${fmtTokens(ctx)} / ${fmtTokens(scale)}`))
  return wrap
}

const footBits = (s: ChatSession): Array<HTMLElement> => {
  const st = s.stats
  const bits = [
    st.model ? el("span", "chat-foot-model", st.model) : null,
    st.turns ? el("span", null, `${st.turns} ${st.turns === 1 ? "turn" : "turns"}`) : null,
    st.cost > 0 ? el("span", null, fmtCost(st.cost)) : null,
    st.ctx ? contextMeter(st.ctx) : null,
    st.rate != null ? el("span", st.rate >= 80 ? "chat-foot-warn" : null, `Rate limit ${Math.round(st.rate)}%`) : null,
  ]
  return bits.filter((b): b is HTMLElement => b !== null)
}

// Model, turns, cost, context and rate limit line
export const renderFoot = (s: ChatSession) => {
  const bits = footBits(s)
  s.foot.hidden = bits.length === 0
  s.foot.replaceChildren(...bits.flatMap((b, i) => (i ? [el("span", "chat-foot-sep", "·"), b] : [b])))
}
