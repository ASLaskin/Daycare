// Matches streamed blocks to final messages.

const QUEUED_MAX = 50

type BlockType = "text" | "thinking"

export class BlockIds {
  private seq = 0
  private messageId = ""
  private readonly open = new Map<number, string>()
  // No stream index, so ids in open order.
  private readonly queued = new Map<string, Record<BlockType, Array<string>>>()

  startMessage(id: string | undefined) {
    this.messageId = id || `m${++this.seq}`
    this.open.clear()
  }

  startBlock(index: number, type: unknown) {
    const block = `${this.messageId}:${index}`
    this.open.set(index, block)
    if (type !== "text" && type !== "thinking") return
    const q = this.queued.get(this.messageId) ?? { text: [], thinking: [] }
    q[type].push(block)
    this.queued.delete(this.messageId)
    this.queued.set(this.messageId, q)
    if (this.queued.size > QUEUED_MAX) this.queued.delete(this.queued.keys().next().value!)
  }

  delta(index: number) {
    return this.open.get(index) ?? `${this.messageId}:${index}`
  }

  // Reuses the streamed id when there was one.
  final(messageId: string, type: BlockType) {
    return this.queued.get(messageId)?.[type].shift() ?? `${messageId}:a${++this.seq}`
  }
}
