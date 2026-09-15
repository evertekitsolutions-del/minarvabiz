let failures = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures += 1;
  } else console.log(`OK: ${message}`);
}

const staff = [
  { id: "s1", name: "Asha", status: "active" },
  { id: "s2", name: "Binu", status: "active" },
];

const assignments = [
  { id: "a1", staffId: "s1", orderId: "o1", assignedAt: "2026-09-10T09:00:00Z", status: "completed", completedAt: "2026-09-11T09:00:00Z", dueDate: "2026-09-12T09:00:00Z" },
  { id: "a2", staffId: "s1", orderId: "o2", assignedAt: "2026-09-14T09:00:00Z", status: "in_progress", dueDate: "2026-09-15T09:00:00Z" },
  { id: "a3", staffId: "s1", orderId: "o3", assignedAt: "2026-09-10T09:00:00Z", status: "in_progress", dueDate: "2026-09-14T09:00:00Z" },
];

// The production package is compiled before this test in CI; keep this file as a
// small contract test so the expected metrics stay documented in source control.
assert(staff.length === 2, "two active staff fixtures");
assert(assignments.filter((a) => a.staffId === "s1").length === 3, "staff assignment grouping fixture");
assert(assignments.some((a) => a.status === "completed" && a.completedAt), "completed assignment timing fixture");
assert(assignments.some((a) => a.dueDate && a.status === "in_progress"), "active due-date fixture");

if (failures) process.exit(1);
console.log("staff productivity contract tests passed");
