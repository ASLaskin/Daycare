// Keyed rows reused across renders and patched in place.

export interface Row<V> {
  readonly node: HTMLElement
  readonly update: (view: V) => void
}

export const keyedRows = <V>(keyOf: (view: V) => string, create: (view: V) => Row<V>) => {
  const rows = new Map<string, Row<V>>()
  return (views: ReadonlyArray<V>): ReadonlyArray<HTMLElement> => {
    const keys = new Set(views.map(keyOf))
    ;[...rows.keys()].filter((k) => !keys.has(k)).forEach((k) => rows.delete(k))
    return views.map((view) => {
      const key = keyOf(view)
      const row = rows.get(key) ?? create(view)
      rows.set(key, row)
      row.update(view)
      return row.node
    })
  }
}

// Reorders children to match, moving only misplaced nodes.
export const syncChildren = (parent: HTMLElement, nodes: ReadonlyArray<Node>) => {
  const wanted = new Set(nodes)
  ;[...parent.childNodes].filter((n) => !wanted.has(n)).forEach((n) => n.remove())
  nodes.forEach((node, i) => {
    const at = parent.childNodes[i] ?? null
    if (at !== node) {
      parent.insertBefore(node, at)
    }
  })
}
