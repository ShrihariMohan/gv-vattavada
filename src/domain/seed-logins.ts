/** Operator-only catalog passwords. Tests import this; the public login page does not. */
export const SEED_PASSWORD_SALT = "gv-console-2026-08";

/** Easy 4-letter staff passwords (rotated into local catalog on load). */
export const SEED_PASSWORDS = {
  admin: "admn",
  manager: "mgrs",
  staff: "staf",
  "kitchen.manager": "chef",
  "kitchen.staff": "cook",
  "stay.manager": "stay",
  "stay.staff": "desk",
} as const;
