import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@/db/client";
import { hashPassword } from "@/lib/password";
import { normalizeEmail } from "./auth";

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
  name: z.string().min(1).default("Platform Super Admin"),
});

/**
 * One-time creation of the first Super Admin. Refuses to run if any platform user already exists,
 * so it cannot be used later to mint extra privileged accounts. Never returns or logs the password.
 */
export async function bootstrapSuperAdmin(db: Db, raw: { email?: string; password?: string; name?: string }) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid bootstrap configuration: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { email, password, name } = parsed.data;
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.scope, "PLATFORM")).limit(1);
    if (existing.length > 0) throw new Error("A platform user already exists; bootstrap is disabled.");

    const [user] = await tx.insert(schema.users).values({
      scope: "PLATFORM", institutionId: null, email: normalizeEmail(email), name, passwordHash,
    }).returning({ id: schema.users.id, email: schema.users.email });
    if (!user) throw new Error("Failed to create Super Admin");

    await tx.insert(schema.userRoles).values({ userId: user.id, role: "SUPER_ADMIN" });
    await tx.insert(schema.auditLogs).values({ actorId: user.id, action: "platform.bootstrap_superadmin", entityType: "user", entityId: user.id });
    return user;
  });
}
