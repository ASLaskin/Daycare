// Top toolbar buttons: built in ids and user commands.

import { Schema } from "effect"
import { DirPath } from "./ids.ts"

export const BuiltinButton = Schema.Literals(["vscode", "github", "finder"])
export type BuiltinButton = typeof BuiltinButton.Type

export const CustomButton = Schema.Struct({ label: Schema.String, command: Schema.String })
export type CustomButton = typeof CustomButton.Type

export const OpenCommand = Schema.Struct({ dir: DirPath, index: Schema.Int })
