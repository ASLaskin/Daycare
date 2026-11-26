// Guest script making a vertical feed advance one full item per gesture.

export const PAGER = `(() => {
  if (window.__daycarePager) {
    return
  }
  window.__daycarePager = true

  const style = document.createElement("style")
  style.textContent = "[data-daycare-pager] { scroll-snap-type: y mandatory !important; overscroll-behavior: contain !important; scrollbar-width: none !important; }" +
    "[data-daycare-pages] > * { scroll-snap-align: start !important; scroll-snap-stop: always !important; }"
  document.documentElement.append(style)

  const scrolls = (e) => {
    const y = getComputedStyle(e).overflowY
    return (y === "auto" || y === "scroll") && e.scrollHeight > e.clientHeight + 1
  }

  // Tallest scroller in the page, for targets on overlays outside it
  const tallest = () => [...document.querySelectorAll("body *")]
    .filter(scrolls)
    .reduce((best, e) => (best && best.clientHeight >= e.clientHeight ? best : e), null)

  let claimed = null

  const scrollerOf = (target) => {
    for (let e = target instanceof Element ? target : null; e; e = e.parentElement) {
      if (scrolls(e)) {
        return e
      }
    }
    if (claimed && claimed.isConnected && scrolls(claimed)) {
      return claimed
    }
    return tallest()
  }

  // Element holding the items, below any wrapper the content spills from
  const listOf = (scroller) => {
    const spill = [...scroller.children].find((c) => c.scrollHeight > scroller.clientHeight * 1.5)
    return spill ? listOf(spill) : scroller
  }

  const watched = new WeakSet()

  const claim = (scroller) => {
    if (claimed && claimed !== scroller) {
      claimed.removeAttribute("data-daycare-pager")
      document.querySelectorAll("[data-daycare-pages]").forEach((e) => e.removeAttribute("data-daycare-pages"))
    }
    claimed = scroller
    if (!watched.has(scroller)) {
      watched.add(scroller)
      scroller.addEventListener("scrollend", () => realign(scroller))
    }
    scroller.setAttribute("data-daycare-pager", "")
    listOf(scroller).setAttribute("data-daycare-pages", "")
    return scroller
  }

  const offsetOf = (scroller, item) => item.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop

  const nearest = (scroller, items) => items.reduce((best, item, i) =>
    Math.abs(offsetOf(scroller, item) - scroller.scrollTop) < Math.abs(offsetOf(scroller, items[best]) - scroller.scrollTop) ? i : best, 0)

  // Items resized mid scroll can leave one partly shown
  const realign = (scroller) => {
    const items = [...listOf(scroller).children].filter((c) => c.offsetHeight > 0)
    const item = items[nearest(scroller, items)]
    if (item && Math.abs(offsetOf(scroller, item) - scroller.scrollTop) > 2) {
      scroller.scrollTo({ top: offsetOf(scroller, item), behavior: "smooth" })
    }
  }

  const step = (scroller, dir) => {
    const items = [...listOf(scroller).children].filter((c) => c.offsetHeight > 0)
    const next = items[nearest(scroller, items) + dir]
    if (next) {
      scroller.scrollTo({ top: offsetOf(scroller, next), behavior: "smooth" })
    }
  }

  const THRESHOLD = 12
  const QUIET_MS = 220
  const MIN_LOCK_MS = 450
  let sum = 0
  let lockedAt = 0
  let lastWheel = 0

  // One step per gesture, ignoring its inertia tail
  addEventListener("wheel", (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      return
    }
    const scroller = scrollerOf(e.target)
    if (!scroller) {
      return
    }
    claim(scroller)
    e.preventDefault()
    e.stopPropagation()
    const now = performance.now()
    const quiet = now - lastWheel > QUIET_MS
    lastWheel = now
    if (lockedAt && (!quiet || now - lockedAt < MIN_LOCK_MS)) {
      return
    }
    if (quiet) {
      sum = 0
    }
    lockedAt = 0
    sum += e.deltaY
    if (Math.abs(sum) < THRESHOLD) {
      return
    }
    step(scroller, Math.sign(sum))
    sum = 0
    lockedAt = now
  }, { capture: true, passive: false })

  // Claim the feed as soon as it renders
  let pending = false
  new MutationObserver(() => {
    if (pending || (claimed && claimed.isConnected && scrolls(claimed))) {
      return
    }
    pending = true
    setTimeout(() => {
      pending = false
      const scroller = tallest()
      if (scroller) {
        claim(scroller)
      }
    }, 300)
  }).observe(document.documentElement, { childList: true, subtree: true })

  addEventListener("touchstart", (e) => {
    const scroller = scrollerOf(e.target)
    if (scroller) {
      claim(scroller)
    }
  }, { capture: true, passive: true })
})()`
