// Branded ids and paths shared by main and renderer.

import { Schema } from "effect"

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type

export const ClaudeSessionId = Schema.String.pipe(Schema.brand("ClaudeSessionId"))
export type ClaudeSessionId = typeof ClaudeSessionId.Type

export const RequestId = Schema.String.pipe(Schema.brand("RequestId"))
export type RequestId = typeof RequestId.Type

export const ToolUseId = Schema.String.pipe(Schema.brand("ToolUseId"))
export type ToolUseId = typeof ToolUseId.Type

export const TaskId = Schema.String.pipe(Schema.brand("TaskId"))
export type TaskId = typeof TaskId.Type

export const SkillId = Schema.String.pipe(Schema.brand("SkillId"))
export type SkillId = typeof SkillId.Type

export const AccountId = Schema.String.pipe(Schema.brand("AccountId"))
export type AccountId = typeof AccountId.Type

export const DirPath = Schema.String.pipe(Schema.brand("DirPath"))
export type DirPath = typeof DirPath.Type

export const FilePath = Schema.String.pipe(Schema.brand("FilePath"))
export type FilePath = typeof FilePath.Type

// Brand constructors for values minted or trusted locally
export const asSessionId = (s: string) => s as SessionId
export const asClaudeSessionId = (s: string) => s as ClaudeSessionId
export const asRequestId = (s: string) => s as RequestId
export const asToolUseId = (s: string) => s as ToolUseId
export const asTaskId = (s: string) => s as TaskId
export const asSkillId = (s: string) => s as SkillId
export const asAccountId = (s: string) => s as AccountId
export const asDirPath = (s: string) => s as DirPath
export const asFilePath = (s: string) => s as FilePath
