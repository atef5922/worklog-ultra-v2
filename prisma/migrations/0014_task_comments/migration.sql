ALTER TABLE "daily_tasks" ADD COLUMN "comment_thread_id" UUID;

CREATE TABLE "task_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "thread_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_comments_thread_id_created_at_id_idx"
  ON "task_comments"("thread_id", "created_at", "id");

ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "task_comment_reads" (
  "thread_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "last_read_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "task_comment_reads_pkey" PRIMARY KEY ("thread_id", "user_id")
);

ALTER TABLE "task_comment_reads"
  ADD CONSTRAINT "task_comment_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
