/** Operator-only catalog passwords. Tests import this; the public login page does not. */
export const SEED_PASSWORD_SALT = "gv-console-2026-08";

export const SEED_PASSWORDS = {
  admin: "8mKq-Cloudy-Admin",
  manager: "4nRt-Cloudy-Mgr",
  staff: "9cWx-Kitchen-Staff",
  "kitchen.manager": "2pLh-Kitchen-Mgr",
  "kitchen.staff": "5tBq-Kitchen-Floor",
  "stay.manager": "7hDv-Stay-Mgr",
  "stay.staff": "3fJc-Stay-Desk",
} as const;
