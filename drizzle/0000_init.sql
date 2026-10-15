CREATE TABLE "coins" (
	"mint" text PRIMARY KEY NOT NULL,
	"launch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"metadata_uri" text NOT NULL,
	"creator" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"market_cap_sol" double precision DEFAULT 0 NOT NULL,
	"curve_progress" double precision DEFAULT 0 NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"graduated" boolean DEFAULT false NOT NULL,
	"graduated_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coins_launch_id_unique" UNIQUE("launch_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone DEFAULT 'epoch' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"ip_hash" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"twitter" text,
	"telegram" text,
	"website" text,
	"image_url" text,
	"metadata_uri" text NOT NULL,
	"mint" text,
	"signature" text,
	"status" text DEFAULT 'prepared' NOT NULL,
	"error" text,
	"last_valid_block_height" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "launches_mint_unique" UNIQUE("mint")
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coins" ADD CONSTRAINT "coins_launch_id_launches_id_fk" FOREIGN KEY ("launch_id") REFERENCES "public"."launches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coins_created_idx" ON "coins" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "launches_status_idx" ON "launches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "launches_wallet_idx" ON "launches" USING btree ("wallet");