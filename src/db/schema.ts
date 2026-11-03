import { sql } from "drizzle-orm";
import {
  boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 }).notNull();

// ---------- enums ----------
export const userScope = pgEnum("user_scope", ["PLATFORM", "INSTITUTION"]);
export const accountStatus = pgEnum("account_status", ["ACTIVE", "DISABLED", "LOCKED", "INVITED"]);
export const institutionStatus = pgEnum("institution_status", ["ACTIVE", "INACTIVE", "SUSPENDED"]);
export const institutionType = pgEnum("institution_type", ["SCHOOL", "COLLEGE", "ACADEMY", "TUITION_CENTER", "VOCATIONAL", "TRAINING", "OTHER"]);
export const subscriptionStatus = pgEnum("subscription_status", ["TRIAL", "ACTIVE", "EXPIRING_SOON", "EXPIRED", "SUSPENDED", "CANCELLED"]);
export const planInterval = pgEnum("plan_interval", ["TRIAL", "MONTHLY", "QUARTERLY", "SIX_MONTH", "ANNUAL", "CUSTOM"]);
export const paymentMethod = pgEnum("payment_method", ["BANK_TRANSFER", "CASH", "MOBILE_WALLET", "GATEWAY", "OTHER"]);
export const paymentVerification = pgEnum("payment_verification", ["PENDING", "VERIFIED", "REJECTED"]);
export const securityEventType = pgEnum("security_event_type", [
  "LOGIN_SUCCESS", "LOGIN_FAILED", "ACCOUNT_LOCKED", "PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_COMPLETED",
  "ADMIN_PASSWORD_RESET", "SESSIONS_REVOKED", "ACCOUNT_DISABLED", "PERMISSION_DENIED", "CROSS_TENANT_ATTEMPT",
]);
export const enrollmentStatus = pgEnum("enrollment_status", ["ACTIVE", "PROMOTED", "TRANSFERRED", "WITHDRAWN", "ALUMNI"]);
export const gender = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);
export const qrTokenStatus = pgEnum("qr_token_status", ["ACTIVE", "REVOKED"]);
export const gateDirection = pgEnum("gate_direction", ["ENTRY", "EXIT"]);

// ---------- platform / identity ----------
export const institutions = pgTable("institutions", {
  id: id(),
  slug: text("slug").notNull().unique(), // used at login to select the tenant
  name: text("name").notNull(),
  registrationNumber: text("registration_number"),
  type: institutionType("type").notNull().default("SCHOOL"),
  logoUrl: text("logo_url"),
  address: text("address"),
  city: text("city"),
  district: text("district"),
  province: text("province"),
  phone: text("phone"),
  email: text("email").notNull().unique(),
  website: text("website"),
  ownerName: text("owner_name"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  currency: text("currency").notNull().default("PKR"),
  status: institutionStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("institutions_status_idx").on(t.status)]);

export const users = pgTable("users", {
  id: id(),
  scope: userScope("scope").notNull(),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "restrict" }),
  email: text("email").notNull(), // stored lower-case
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  status: accountStatus("status").notNull().default("ACTIVE"),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_institution_email_uq").on(t.institutionId, t.email).where(sql`${t.institutionId} is not null`),
  uniqueIndex("users_platform_email_uq").on(t.email).where(sql`${t.institutionId} is null`),
  check("users_scope_institution_ck", sql`(${t.scope} = 'PLATFORM' and ${t.institutionId} is null) or (${t.scope} = 'INSTITUTION' and ${t.institutionId} is not null)`),
  index("users_institution_idx").on(t.institutionId),
]);

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // RoleKey from src/lib/rbac.ts
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256; raw token only lives in the cookie
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdById: text("created_by_id"),
  createdAt: createdAt(),
}, (t) => [index("prt_user_idx").on(t.userId)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"), // never holds passwords, tokens or secrets
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("audit_inst_idx").on(t.institutionId, t.createdAt), index("audit_actor_idx").on(t.actorId), index("audit_action_idx").on(t.action)]);

export const securityEvents = pgTable("security_events", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  institutionId: text("institution_id"),
  type: securityEventType("type").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  detail: text("detail"),
  createdAt: createdAt(),
}, (t) => [index("secev_user_idx").on(t.userId, t.createdAt), index("secev_type_idx").on(t.type, t.createdAt)]);

// ---------- subscriptions (platform billing; separate from student fees) ----------
export const subscriptionPlans = pgTable("subscription_plans", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  interval: planInterval("interval").notNull(),
  durationDays: integer("duration_days"), // required for TRIAL/CUSTOM only
  price: money("price"),
  currency: text("currency").notNull().default("PKR"),
  maxStudents: integer("max_students"),
  maxUsers: integer("max_users"),
  maxCampuses: integer("max_campuses"),
  features: jsonb("features"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  planId: text("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  status: subscriptionStatus("status").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  graceDays: integer("grace_days").notNull().default(7),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("subs_inst_status_idx").on(t.institutionId, t.status), index("subs_expires_idx").on(t.expiresAt)]);

// Append-only: rows are never updated in place or deleted by application code.
export const subscriptionPayments = pgTable("subscription_payments", {
  id: id(),
  subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  planId: text("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  institutionId: text("institution_id").notNull(),
  amount: money("amount"),
  currency: text("currency").notNull().default("PKR"),
  method: paymentMethod("method").notNull(),
  transactionRef: text("transaction_ref"),
  paidOn: date("paid_on").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  verification: paymentVerification("verification").notNull().default("PENDING"),
  verifiedById: text("verified_by_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  recordedById: text("recorded_by_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("subpay_inst_idx").on(t.institutionId, t.paidOn), check("subpay_amount_ck", sql`${t.amount} > 0`)]);

export const paymentReceipts = pgTable("payment_receipts", {
  id: id(),
  receiptNumber: text("receipt_number").notNull().unique(),
  paymentId: text("payment_id").notNull().unique().references(() => subscriptionPayments.id, { onDelete: "restrict" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- academic core (every row carries institution_id) ----------
export const academicSessions = pgTable("academic_sessions", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
}, (t) => [uniqueIndex("acad_sess_uq").on(t.institutionId, t.name)]);

export const classes = pgTable("classes", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
}, (t) => [uniqueIndex("classes_uq").on(t.institutionId, t.name)]);

export const sections = pgTable("sections", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  classId: text("class_id").notNull().references(() => classes.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
}, (t) => [uniqueIndex("sections_uq").on(t.classId, t.name), index("sections_inst_idx").on(t.institutionId)]);

export const students = pgTable("students", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  admissionNumber: text("admission_number").notNull(),
  fullName: text("full_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: gender("gender"),
  address: text("address"),
  previousSchool: text("previous_school"),
  admissionDate: date("admission_date").notNull(),
  emergencyContact: text("emergency_contact"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("students_adm_uq").on(t.institutionId, t.admissionNumber), index("students_name_idx").on(t.institutionId, t.fullName)]);

export const enrollments = pgTable("enrollments", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "restrict" }),
  sessionId: text("session_id").notNull().references(() => academicSessions.id, { onDelete: "restrict" }),
  sectionId: text("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  rollNumber: text("roll_number"),
  status: enrollmentStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("enroll_uq").on(t.studentId, t.sessionId), index("enroll_inst_sec_idx").on(t.institutionId, t.sectionId)]);

export const parents = pgTable("parents", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  userId: text("user_id").unique().references(() => users.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
}, (t) => [index("parents_inst_idx").on(t.institutionId)]);

export const parentStudentRelationships = pgTable("parent_student_relationships", {
  parentId: text("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull().default("Guardian"),
}, (t) => [primaryKey({ columns: [t.parentId, t.studentId] })]);

// ---------- smart gate / attendance ----------
export const qrTokens = pgTable("qr_tokens", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(), // opaque random token, stored hashed, no personal data
  status: qrTokenStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("qr_inst_student_idx").on(t.institutionId, t.studentId)]);

export const gateDevices = pgTable("gate_devices", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("gate_dev_uq").on(t.institutionId, t.name)]);

export const gateScanLogs = pgTable("gate_scan_logs", {
  id: id(),
  institutionId: text("institution_id").notNull(),
  deviceId: text("device_id").notNull().references(() => gateDevices.id, { onDelete: "restrict" }),
  studentId: text("student_id"),
  direction: gateDirection("direction").notNull(),
  accepted: boolean("accepted").notNull(),
  reason: text("reason"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  clientScanId: text("client_scan_id").notNull(), // makes offline replays idempotent
}, (t) => [uniqueIndex("gate_scan_client_uq").on(t.institutionId, t.clientScanId), index("gate_scan_time_idx").on(t.institutionId, t.scannedAt)]);

export const attendanceRecords = pgTable("attendance_records", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "restrict" }),
  date: date("date").notNull(), // institute-local calendar date
  status: text("status").notNull().default("PRESENT"),
  source: text("source").notNull().default("MANUAL"),
  firstEntryAt: timestamp("first_entry_at", { withTimezone: true }),
  lastExitAt: timestamp("last_exit_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("attendance_uq").on(t.studentId, t.date), index("attendance_inst_date_idx").on(t.institutionId, t.date)]);
