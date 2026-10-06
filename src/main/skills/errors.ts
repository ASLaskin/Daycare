// Skill mutation failure shown to the user.

import { Schema } from "effect"

export class SkillError extends Schema.TaggedError<SkillError>()("SkillError", { message: Schema.String }) {}

export const notFound = new SkillError({ message: "That skill was not found. Refresh the list and try again." })
