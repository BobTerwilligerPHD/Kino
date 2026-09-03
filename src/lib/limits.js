// shared between the browser and api/gemini.js — see docs/architecture.md
// ("Input/output limits") for why these specific values were chosen

export const MESSAGE_ENTRY_MAX_LENGTH = 2000

// composer's own limit is smaller than the server's — reserves room for
// CLARIFY_BLOCKED_NOTE, appended to the current message when needed
export const CLARIFY_BLOCKED_NOTE_LENGTH = 180
export const USER_INPUT_MAX_LENGTH = MESSAGE_ENTRY_MAX_LENGTH - CLARIFY_BLOCKED_NOTE_LENGTH

// oversized title/reason reject the recommendation entry rather than truncate it
export const TITLE_MAX_LENGTH = 150
export const REASON_MAX_LENGTH = 200
