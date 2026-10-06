export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector)
  if (!node) {
    throw new Error(`Missing ${selector}`)
  }
  return node
}

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (cls) {
    node.className = cls
  }
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

export const baseName = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p
export const tildify = (p: string) => p.replace(/^\/Users\/[^/]+/, "~")
