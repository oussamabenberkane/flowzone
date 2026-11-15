CREATE TABLE "ai_action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" uuid,
	"tool" text NOT NULL,
	"tier" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"undo" jsonb,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"complete" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pending_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action_id" uuid NOT NULL,
	"args" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_profile_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_action_log" ADD CONSTRAINT "ai_action_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_log" ADD CONSTRAINT "ai_action_log_message_id_ai_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_pending_confirmations" ADD CONSTRAINT "ai_pending_confirmations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_pending_confirmations" ADD CONSTRAINT "ai_pending_confirmations_action_id_ai_action_log_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_action_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_profile_items" ADD CONSTRAINT "ai_profile_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_counters" ADD CONSTRAINT "ai_usage_counters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_action_log_user_client_request_uq" ON "ai_action_log" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "ai_action_log_user_status_idx" ON "ai_action_log" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_messages_user_client_request_uq" ON "ai_chat_messages" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "ai_chat_messages_user_created_idx" ON "ai_chat_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_pending_confirmations_user_client_request_uq" ON "ai_pending_confirmations" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_pending_action_uq" ON "ai_pending_confirmations" USING btree ("user_id","action_id");--> statement-breakpoint
CREATE INDEX "ai_pending_user_expires_idx" ON "ai_pending_confirmations" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_profile_items_user_client_request_uq" ON "ai_profile_items" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "ai_profile_user_status_idx" ON "ai_profile_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_counters_user_client_request_uq" ON "ai_usage_counters" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_user_day_uq" ON "ai_usage_counters" USING btree ("user_id","day");