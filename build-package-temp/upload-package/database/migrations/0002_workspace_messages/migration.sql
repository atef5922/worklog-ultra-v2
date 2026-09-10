CREATE TABLE "workspace_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sender_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "subject" TEXT NULL,
  "body" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ(6) NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workspace_messages"
ADD CONSTRAINT "workspace_messages_sender_id_fkey"
FOREIGN KEY ("sender_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_messages"
ADD CONSTRAINT "workspace_messages_recipient_id_fkey"
FOREIGN KEY ("recipient_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "workspace_messages_recipient_id_created_at_idx"
ON "workspace_messages"("recipient_id", "created_at");

CREATE INDEX "workspace_messages_sender_id_created_at_idx"
ON "workspace_messages"("sender_id", "created_at");
