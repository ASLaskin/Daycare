// QR code for a string as an SVG element.

import qrcode from "qrcode-generator"

const SVG = "http://www.w3.org/2000/svg"
// Quiet zone in modules
const MARGIN = 4

export const qrSvg = (text: string): SVGSVGElement => {
  const code = qrcode(0, "M")
  code.addData(text)
  code.make()
  const count = code.getModuleCount()
  const size = count + MARGIN * 2
  const cells = Array.from({ length: count * count }, (_, i) => ({ row: Math.floor(i / count), col: i % count }))
  const d = cells
    .filter(({ row, col }) => code.isDark(row, col))
    .map(({ row, col }) => `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`)
    .join("")
  const svg = document.createElementNS(SVG, "svg")
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`)
  svg.setAttribute("shape-rendering", "crispEdges")
  const background = document.createElementNS(SVG, "rect")
  background.setAttribute("width", String(size))
  background.setAttribute("height", String(size))
  background.setAttribute("fill", "#fff")
  const path = document.createElementNS(SVG, "path")
  path.setAttribute("d", d)
  path.setAttribute("fill", "#000")
  svg.append(background, path)
  return svg
}
