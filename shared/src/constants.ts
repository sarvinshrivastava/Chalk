/** UPI VPA format: username@bankhandle */
export const UPI_VPA_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;

/** Minimum group name length */
export const GROUP_NAME_MIN_LENGTH = 1;

/** Maximum group name length */
export const GROUP_NAME_MAX_LENGTH = 50;

/** Maximum members per group */
export const GROUP_MAX_MEMBERS = 50;

/** Nudge cooldown in hours */
export const NUDGE_COOLDOWN_HOURS = 24;

/** OCR confidence threshold — below this, flag for review */
export const OCR_CONFIDENCE_THRESHOLD = 0.75;

/** Personal dictionary hard cap */
export const DICTIONARY_MAX_ENTRIES = 500;

/** Fuzzy match: max Levenshtein distance */
export const FUZZY_MATCH_MAX_DISTANCE = 2;

/** Fuzzy match: minimum string length to attempt */
export const FUZZY_MATCH_MIN_LENGTH = 5;
