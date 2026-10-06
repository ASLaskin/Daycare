// Parses row ids like "project:/dir:name".

export const kindOf = (id: string) => id.slice(0, Math.max(id.indexOf(":"), 0))

export const isProjectId = (id: string) => kindOf(id) === "project" || kindOf(id) === "project-command"

export const projectDirFromId = (id: string) => {
  const body = id.slice(id.indexOf(":") + 1)
  const cut = body.lastIndexOf(":")
  return cut > 0 ? body.slice(0, cut) : null
}
