CREATE TYPE "ScreenshotUploadStatus" AS ENUM ('pending', 'uploaded', 'failed');
CREATE TYPE "ScreenshotCaptureMode" AS ENUM ('primary_display', 'all_displays', 'active_window');
CREATE TYPE "ScreenshotAuditAction" AS ENUM ('viewed', 'downloaded', 'deleted');

CREATE TABLE "devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "device_key" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "hostname" TEXT NULL,
  "app_version" TEXT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "devices"
ADD CONSTRAINT "devices_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "devices_user_id_device_key_key" ON "devices"("user_id", "device_key");
CREATE INDEX "devices_user_id_last_seen_at_idx" ON "devices"("user_id", "last_seen_at");

CREATE TABLE "screenshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "department_id" UUID NULL,
  "attendance_record_id" UUID NULL,
  "device_id" UUID NULL,
  "storage_key" TEXT NOT NULL,
  "client_capture_id" TEXT NOT NULL,
  "captured_at" TIMESTAMPTZ(6) NOT NULL,
  "uploaded_at" TIMESTAMPTZ(6) NULL,
  "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0,
  "file_size" INTEGER NOT NULL DEFAULT 0,
  "mime_type" TEXT NOT NULL DEFAULT 'image/jpeg',
  "checksum" TEXT NULL,
  "capture_mode" "ScreenshotCaptureMode" NOT NULL DEFAULT 'primary_display',
  "upload_status" "ScreenshotUploadStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "screenshots"
ADD CONSTRAINT "screenshots_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "screenshots"
ADD CONSTRAINT "screenshots_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "screenshots"
ADD CONSTRAINT "screenshots_attendance_record_id_fkey"
FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "screenshots"
ADD CONSTRAINT "screenshots_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Upload retries reuse the same client_capture_id, so this is what makes
-- "complete upload" idempotent instead of duplicating logical screenshots.
CREATE UNIQUE INDEX "screenshots_user_id_client_capture_id_key"
ON "screenshots"("user_id", "client_capture_id");

CREATE INDEX "screenshots_user_id_captured_at_idx" ON "screenshots"("user_id", "captured_at");
CREATE INDEX "screenshots_department_id_captured_at_idx" ON "screenshots"("department_id", "captured_at");
CREATE INDEX "screenshots_attendance_record_id_idx" ON "screenshots"("attendance_record_id");
CREATE INDEX "screenshots_upload_status_captured_at_idx" ON "screenshots"("upload_status", "captured_at");

CREATE TABLE "screenshot_access_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "screenshot_id" UUID NOT NULL,
  "viewer_user_id" UUID NOT NULL,
  "action" "ScreenshotAuditAction" NOT NULL,
  "ip_address" TEXT NULL,
  "user_agent" TEXT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "screenshot_access_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "screenshot_access_logs"
ADD CONSTRAINT "screenshot_access_logs_screenshot_id_fkey"
FOREIGN KEY ("screenshot_id") REFERENCES "screenshots"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "screenshot_access_logs"
ADD CONSTRAINT "screenshot_access_logs_viewer_user_id_fkey"
FOREIGN KEY ("viewer_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "screenshot_access_logs_screenshot_id_created_at_idx"
ON "screenshot_access_logs"("screenshot_id", "created_at");
CREATE INDEX "screenshot_access_logs_viewer_user_id_created_at_idx"
ON "screenshot_access_logs"("viewer_user_id", "created_at");
