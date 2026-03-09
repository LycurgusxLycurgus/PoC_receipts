import postgres, { type Sql } from "postgres";
import type { Env } from "../config/env.js";

export type Database = Sql;

export function createDb(env: Env): Database {
  return postgres(env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20
  });
}
