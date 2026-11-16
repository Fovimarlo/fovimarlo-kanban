CREATE TABLE IF NOT EXISTS "work_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"memberId" bigint NOT NULL,
	"boardId" bigint,
	"date" date NOT NULL,
	"content" text NOT NULL,
	"durationMinutes" integer,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "work_log_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "work_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "backgroundImageKey" varchar(512);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_log" ADD CONSTRAINT "work_log_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_log" ADD CONSTRAINT "work_log_memberId_workspace_members_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_log" ADD CONSTRAINT "work_log_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_log" ADD CONSTRAINT "work_log_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_log" ADD CONSTRAINT "work_log_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_log_workspace_date_idx" ON "work_log" USING btree ("workspaceId","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_log_member_date_idx" ON "work_log" USING btree ("memberId","date");