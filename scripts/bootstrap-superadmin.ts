import "dotenv/config";
import { db, pool } from "../src/db/client";
import { bootstrapSuperAdmin } from "../src/server/bootstrap";

async function main() {
  const user = await bootstrapSuperAdmin(db, {
    email: process.env.BOOTSTRAP_SUPERADMIN_EMAIL,
    password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD,
  });
  console.log(`Super Admin created: ${user.email}`);
  console.log("Now remove BOOTSTRAP_SUPERADMIN_PASSWORD from your environment.");
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : "Bootstrap failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
