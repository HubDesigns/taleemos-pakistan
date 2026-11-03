CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'DISABLED', 'LOCKED', 'INVITED');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('ACTIVE', 'PROMOTED', 'TRANSFERRED', 'WITHDRAWN', 'ALUMNI');--> statement-breakpoint
CREATE TYPE "public"."gate_direction" AS ENUM('ENTRY', 'EXIT');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."institution_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."institution_type" AS ENUM('SCHOOL', 'COLLEGE', 'ACADEMY', 'TUITION_CENTER', 'VOCATIONAL', 'TRAINING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('BANK_TRANSFER', 'CASH', 'MOBILE_WALLET', 'GATEWAY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_verification" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."plan_interval" AS ENUM('TRIAL', 'MONTHLY', 'QUARTERLY', 'SIX_MONTH', 'ANNUAL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."qr_token_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'ADMIN_PASSWORD_RESET', 'SESSIONS_REVOKED', 'ACCOUNT_DISABLED', 'PERMISSION_DENIED', 'CROSS_TENANT_ATTEMPT');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIAL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'SUSPENDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_scope" AS ENUM('PLATFORM', 'INSTITUTION');--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"student_id" text NOT NULL,
	"date" date NOT NULL,
	"status" text DEFAULT 'PRESENT' NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"first_entry_at" timestamp with time zone,
	"last_exit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"student_id" text NOT NULL,
	"session_id" text NOT NULL,
	"section_id" text NOT NULL,
	"roll_number" text,
	"status" "enrollment_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_scan_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"device_id" text NOT NULL,
	"student_id" text,
	"direction" "gate_direction" NOT NULL,
	"accepted" boolean NOT NULL,
	"reason" text,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_scan_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"registration_number" text,
	"type" "institution_type" DEFAULT 'SCHOOL' NOT NULL,
	"logo_url" text,
	"address" text,
	"city" text,
	"district" text,
	"province" text,
	"phone" text,
	"email" text NOT NULL,
	"website" text,
	"owner_name" text,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"status" "institution_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "institutions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "parent_student_relationships" (
	"parent_id" text NOT NULL,
	"student_id" text NOT NULL,
	"relationship" text DEFAULT 'Guardian' NOT NULL,
	CONSTRAINT "parent_student_relationships_parent_id_student_id_pk" PRIMARY KEY("parent_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"user_id" text,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	CONSTRAINT "parents_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "payment_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"payment_id" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipts_receipt_number_unique" UNIQUE("receipt_number"),
	CONSTRAINT "payment_receipts_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "qr_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"student_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "qr_token_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "qr_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"class_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"institution_id" text,
	"type" "security_event_type" NOT NULL,
	"ip" text,
	"user_agent" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"admission_number" text NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"address" text,
	"previous_school" text,
	"admission_date" date NOT NULL,
	"emergency_contact" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"institution_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"method" "payment_method" NOT NULL,
	"transaction_ref" text,
	"paid_on" date NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"verification" "payment_verification" DEFAULT 'PENDING' NOT NULL,
	"verified_by_id" text,
	"verified_at" timestamp with time zone,
	"recorded_by_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "subpay_amount_ck" CHECK ("subscription_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"interval" "plan_interval" NOT NULL,
	"duration_days" integer,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"max_students" integer,
	"max_users" integer,
	"max_campuses" integer,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"grace_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" "user_scope" NOT NULL,
	"institution_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_scope_institution_ck" CHECK (("users"."scope" = 'PLATFORM' and "users"."institution_id" is null) or ("users"."scope" = 'INSTITUTION' and "users"."institution_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_session_id_academic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_devices" ADD CONSTRAINT "gate_devices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_scan_logs" ADD CONSTRAINT "gate_scan_logs_device_id_gate_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."gate_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_student_relationships" ADD CONSTRAINT "parent_student_relationships_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_student_relationships" ADD CONSTRAINT "parent_student_relationships_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_subscription_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."subscription_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acad_sess_uq" ON "academic_sessions" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_uq" ON "attendance_records" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "attendance_inst_date_idx" ON "attendance_records" USING btree ("institution_id","date");--> statement-breakpoint
CREATE INDEX "audit_inst_idx" ON "audit_logs" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_uq" ON "classes" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "enroll_uq" ON "enrollments" USING btree ("student_id","session_id");--> statement-breakpoint
CREATE INDEX "enroll_inst_sec_idx" ON "enrollments" USING btree ("institution_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_dev_uq" ON "gate_devices" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_scan_client_uq" ON "gate_scan_logs" USING btree ("institution_id","client_scan_id");--> statement-breakpoint
CREATE INDEX "gate_scan_time_idx" ON "gate_scan_logs" USING btree ("institution_id","scanned_at");--> statement-breakpoint
CREATE INDEX "institutions_status_idx" ON "institutions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parents_inst_idx" ON "parents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "prt_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "qr_inst_student_idx" ON "qr_tokens" USING btree ("institution_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_uq" ON "sections" USING btree ("class_id","name");--> statement-breakpoint
CREATE INDEX "sections_inst_idx" ON "sections" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "secev_user_idx" ON "security_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "secev_type_idx" ON "security_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "students_adm_uq" ON "students" USING btree ("institution_id","admission_number");--> statement-breakpoint
CREATE INDEX "students_name_idx" ON "students" USING btree ("institution_id","full_name");--> statement-breakpoint
CREATE INDEX "subpay_inst_idx" ON "subscription_payments" USING btree ("institution_id","paid_on");--> statement-breakpoint
CREATE INDEX "subs_inst_status_idx" ON "subscriptions" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "subs_expires_idx" ON "subscriptions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_institution_email_uq" ON "users" USING btree ("institution_id","email") WHERE "users"."institution_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_platform_email_uq" ON "users" USING btree ("email") WHERE "users"."institution_id" is null;--> statement-breakpoint
CREATE INDEX "users_institution_idx" ON "users" USING btree ("institution_id");