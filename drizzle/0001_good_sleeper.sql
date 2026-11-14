CREATE TYPE "public"."task_energy" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."recurrence_outcome" AS ENUM('completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('note', 'journal');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"project_id" uuid,
	"parent_task_id" uuid,
	"due_date" date,
	"due_time" time,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"energy" "task_energy",
	"estimate_minutes" integer,
	"recurrence_rule" jsonb,
	"recurrence_start" date,
	"recurrence_paused" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snoozed_until" date,
	"dropped_at" timestamp with time zone,
	CONSTRAINT "tasks_estimate_range" CHECK ("tasks"."estimate_minutes" is null or ("tasks"."estimate_minutes" between 1 and 1440))
);
--> statement-breakpoint
CREATE TABLE "recurrence_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"outcome" "recurrence_outcome" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"title" text,
	"body" text DEFAULT '' NOT NULL,
	"entry_date" date NOT NULL,
	"task_id" uuid,
	"project_id" uuid
);
--> statement-breakpoint
CREATE TABLE "day_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day_plan_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan_date" date NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"quiet_hours_start" time DEFAULT '21:00' NOT NULL,
	"quiet_hours_end" time DEFAULT '08:00' NOT NULL,
	"first_run_completed" boolean DEFAULT false NOT NULL,
	"ai_features" boolean DEFAULT false NOT NULL,
	"ai_features_changed_at" timestamp with time zone,
	"ai_notes_journal" boolean DEFAULT false NOT NULL,
	"ai_notes_journal_changed_at" timestamp with time zone,
	"ai_profile" boolean DEFAULT false NOT NULL,
	"ai_profile_changed_at" timestamp with time zone,
	"nudges" boolean DEFAULT false NOT NULL,
	"nudges_changed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_records" ADD CONSTRAINT "recurrence_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_records" ADD CONSTRAINT "recurrence_records_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_day_plan_id_day_plans_id_fk" FOREIGN KEY ("day_plan_id") REFERENCES "public"."day_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plan_items" ADD CONSTRAINT "day_plan_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_client_request_uq" ON "projects" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "projects_user_position_idx" ON "projects" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_user_client_request_uq" ON "tasks" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_project_idx" ON "tasks" USING btree ("user_id","project_id","position");--> statement-breakpoint
CREATE INDEX "tasks_user_parent_idx" ON "tasks" USING btree ("user_id","parent_task_id","position");--> statement-breakpoint
CREATE INDEX "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_activity_idx" ON "tasks" USING btree ("user_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin (to_tsvector('simple', "title"));--> statement-breakpoint
CREATE UNIQUE INDEX "recurrence_records_user_client_request_uq" ON "recurrence_records" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurrence_records_task_occurrence_uq" ON "recurrence_records" USING btree ("user_id","task_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "recurrence_records_user_task_idx" ON "recurrence_records" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_user_client_request_uq" ON "entries" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "entries_user_date_idx" ON "entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "entries_user_task_idx" ON "entries" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE INDEX "entries_user_project_idx" ON "entries" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "entries_search_idx" ON "entries" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || "body"));--> statement-breakpoint
CREATE UNIQUE INDEX "day_plan_items_user_client_request_uq" ON "day_plan_items" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "day_plan_items_plan_task_uq" ON "day_plan_items" USING btree ("user_id","day_plan_id","task_id");--> statement-breakpoint
CREATE INDEX "day_plan_items_plan_position_idx" ON "day_plan_items" USING btree ("user_id","day_plan_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "day_plans_user_client_request_uq" ON "day_plans" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "day_plans_user_date_uq" ON "day_plans" USING btree ("user_id","plan_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_client_request_uq" ON "user_settings" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_uq" ON "user_settings" USING btree ("user_id");