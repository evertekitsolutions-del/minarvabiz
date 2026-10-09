-- Attendance Grid foreign-key lookup indexes (additive, repeatable).
-- PostgreSQL does not automatically index referencing FK columns.
-- These indexes reduce lock/scan amplification when branches and organizations
-- are checked or maintained, without changing tenant authority or row data.
CREATE INDEX IF NOT EXISTS idx_staff_attendance_branch_fk
  ON public.staff_attendance (branch_id);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_receipts_org_fk
  ON public.staff_attendance_event_receipts (org_id);
