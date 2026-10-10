// Byte range requests for streamed media.

export interface ByteRange {
  readonly start: number
  readonly end: number
}

// First range of a Range header, clamped to the file; null when unsatisfiable
export const parseRange = (header: string, size: number): ByteRange | null => {
  const m = /^bytes=(\d*)-(\d*)/.exec(header.trim())
  if (!m || size <= 0 || (!m[1] && !m[2])) {
    return null
  }
  if (!m[1]) {
    const tail = Math.min(Number(m[2]), size)
    return tail > 0 ? { start: size - tail, end: size - 1 } : null
  }
  const start = Number(m[1])
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  return start <= end ? { start, end } : null
}
