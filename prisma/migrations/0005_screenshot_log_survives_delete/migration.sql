-- A `deleted` audit entry documents the deletion itself, so it must
-- survive the screenshot row it points at. CASCADE was wrong for this:
-- it erased the very record of a deletion the moment that deletion
-- happened. SET NULL keeps every log row (viewer, action, timestamp)
-- intact and only clears the now-meaningless reference.
ALTER TABLE "screenshot_access_logs" ALTER COLUMN "screenshot_id" DROP NOT NULL;

ALTER TABLE "screenshot_access_logs" DROP CONSTRAINT "screenshot_access_logs_screenshot_id_fkey";

ALTER TABLE "screenshot_access_logs"
ADD CONSTRAINT "screenshot_access_logs_screenshot_id_fkey"
FOREIGN KEY ("screenshot_id") REFERENCES "screenshots"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
