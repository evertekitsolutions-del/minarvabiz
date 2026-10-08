-- Attendance Grid: tenant-safe cloud authority for Online + Hybrid sync.
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT public.current_org_id(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','half_day','leave','holiday')),
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  notes TEXT,
  branch_id UUID REFERENCES public.branches(id),
  device_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, staff_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_org_date ON public.staff_attendance(org_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date ON public.staff_attendance(staff_id, attendance_date DESC);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_attendance FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_attendance TO authenticated;
GRANT ALL ON TABLE public.staff_attendance TO service_role;

DROP POLICY IF EXISTS staff_attendance_org_access ON public.staff_attendance;
CREATE POLICY staff_attendance_org_access ON public.staff_attendance
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

COMMENT ON TABLE public.staff_attendance IS 'Tenant-isolated staff attendance ledger used by Online/Hybrid sync.';
