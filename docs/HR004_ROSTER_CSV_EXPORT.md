# HR-004 monthly roster CSV export

Baseline `5d1793198ce479b5fbfb060c13d96af477ccb829`. Shared Web/Windows planner now exports only the rows visible within the chosen month and optional staff selection. Exports date, staff, template, branch, shift times, break, status and version. CSV escapes quotes, formula-leading values and controls; no database, audit or queue writes. Uses existing authorized RLS-filtered Web state and Windows role-gated planner. No new dependencies, paid services, migrations or customer data changes.

Not a full HR-004, payroll, statutory or timezone completion. Web editing remains deliberately blocked pending safe cloud reconciliation. Real customer production UAT remains outstanding. Master Vision stays ~51%.
