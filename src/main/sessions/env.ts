// Environment without Claude Code session variables
export const cleanEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(env).filter(([key]) => key !== "CLAUDECODE" && !(key.startsWith("CLAUDE_CODE_") && key !== "CLAUDE_CODE_OAUTH_TOKEN")),
  )

// Opts claude into experimental Code Mode
export const codeModeEnv = (on: boolean): NodeJS.ProcessEnv => (on ? { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: "1" } : {})
