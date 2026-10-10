// Stops stray file drops from navigating the window.
export const initDropGuard = () => {
  const block = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault()
    }
  }
  document.addEventListener("dragover", block)
  document.addEventListener("drop", block)
}
