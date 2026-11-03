import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url.split("?")[0] ?? url; // drop Prisma-style ?schema= params
}

const globalForPool = globalThis as unknown as { __taleemosPool?: Pool };

export const pool = globalForPool.__taleemosPool ?? new Pool({ connectionString: connectionString(), max: 10 });
if (process.env.NODE_ENV !== "production") globalForPool.__taleemosPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export { schema };
