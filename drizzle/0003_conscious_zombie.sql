CREATE TABLE "nudge_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"reason_code" text NOT NULL,
	"text" text NOT NULL,
	"wording" text NOT NULL,
	"outcome" text NOT NULL,
	"local_day" date NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nudge_task_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" uuid NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_secret" text NOT NULL,
	"label" text NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nudge_log" ADD CONSTRAINT "nudge_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_log" ADD CONSTRAINT "nudge_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_task_controls" ADD CONSTRAINT "nudge_task_controls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_task_controls" ADD CONSTRAINT "nudge_task_controls_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nudge_log_user_client_request_uq" ON "nudge_log" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "nudge_log_user_day_idx" ON "nudge_log" USING btree ("user_id","local_day");--> statement-breakpoint
CREATE INDEX "nudge_log_user_decided_idx" ON "nudge_log" USING btree ("user_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nudge_task_controls_user_client_request_uq" ON "nudge_task_controls" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nudge_task_controls_user_task_uq" ON "nudge_task_controls" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_client_request_uq" ON "push_subscriptions" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_uq" ON "push_subscriptions" USING btree ("user_id","endpoint");