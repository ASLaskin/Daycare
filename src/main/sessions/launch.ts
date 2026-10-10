// Command line and config files for a claude child.

import fs from "node:fs"
import path from "node:path"
import type { SessionId } from "../../shared/ids.ts"
import type { ControlEndpoint } from "../control/ControlServer.ts"
import { TOKEN_HEADER } from "../control/hook.ts"
import { canResume, type Session } from "./model.ts"
import { withOogaBooga } from "./oogaBooga.ts"
import { MASTER_PROMPT, WORKER_PROMPT } from "./prompts.ts"

type Endpoint = ControlEndpoint["Service"]

export const MCP_TIMEOUT_MS = 30 * 60 * 1000

const HOOK_TIMEOUT_SECONDS = 10

// HTTP hook settings, token read from DAYCARE_TOKEN
const hookSettings = (endpoint: Endpoint, id: SessionId) => {
  const entry = () => [
    {
      hooks: [
        {
          type: "http",
          url: `${endpoint.url}/hook/${id}`,
          headers: { [TOKEN_HEADER]: "$DAYCARE_TOKEN" },
          allowedEnvVars: ["DAYCARE_TOKEN"],
          timeout: HOOK_TIMEOUT_SECONDS,
        },
      ],
    },
  ]
  return {
    hooks: {
      SessionStart: entry(),
      UserPromptSubmit: entry(),
      Stop: entry(),
    },
  }
}

// Private MCP config file for a master
export const writeMcpConfig = (mcpDir: string, endpoint: Endpoint, id: SessionId) => {
  const file = path.join(mcpDir, `${id}.json`)
  fs.mkdirSync(mcpDir, { recursive: true, mode: 0o700 })
  const config = {
    mcpServers: {
      daycare: {
        type: "http",
        url: `${endpoint.url}/mcp/${id}`,
        headers: { [TOKEN_HEADER]: endpoint.token },
        timeout: MCP_TIMEOUT_MS,
      },
    },
  }
  fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600 })
  return file
}

// Launch options read from settings
export interface LaunchOptions {
  readonly oogaBooga: boolean
}

const roleArgs = (s: Session, mcpDir: string, endpoint: Endpoint, options: LaunchOptions) => {
  if (s.role !== "master") {
    return ["--append-system-prompt", withOogaBooga(WORKER_PROMPT, options.oogaBooga)]
  }
  return [
    "--mcp-config",
    writeMcpConfig(mcpDir, endpoint, s.id),
    "--allowedTools",
    "mcp__daycare__*",
    // Built in subagents are off for masters
    "--disallowedTools",
    "Agent",
    "Task",
    "--append-system-prompt",
    withOogaBooga(MASTER_PROMPT, options.oogaBooga),
  ]
}

// Arguments to start or resume a session
export const claudeArgs = (s: Session, resume: boolean, mcpDir: string, endpoint: Endpoint, options: LaunchOptions) => [
  "--settings",
  JSON.stringify(hookSettings(endpoint, s.id)),
  ...(resume && canResume(s) ? ["--resume", s.claudeSessionId] : ["--session-id", s.claudeSessionId]),
  ...(s.model ? ["--model", s.model] : []),
  ...(s.permissionMode !== "default" ? ["--permission-mode", s.permissionMode] : []),
  ...roleArgs(s, mcpDir, endpoint, options),
]
