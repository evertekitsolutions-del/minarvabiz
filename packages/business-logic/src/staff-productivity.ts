/**
 * Staff Productivity Intelligence — deterministic operational metrics.
 *
 * This module does not calculate salary or financial truth. It measures workload,
 * completion velocity, on-time performance, and capacity from recorded assignments.
 */

import type { StaffMember, StaffAssignment } from "@minarvabiz/types";

export interface StaffProductivityAssignment extends StaffAssignment {
  serviceType?: string | null;
  dueDate?: string | null;
}

export interface StaffProductivityResult {
  staffId: string;
  staffName: string;
  activeAssignments: number;
  completedAssignments: number;
  overdueAssignments: number;
  dueSoonAssignments: number;
  completionRate: number;
  onTimeRate: number;
  averageCompletionDays: number | null;
  workloadScore: number;
  capacityStatus: "available" | "balanced" | "busy" | "overloaded";
}

export interface StaffProductivitySnapshot {
  staff: StaffProductivityResult[];
  totalActiveAssignments: number;
  totalCompletedAssignments: number;
  overloadedStaff: number;
  averageCompletionRate: number;
  averageOnTimeRate: number;
  generatedAt: string;
}

function finiteNonNegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

function diffDays(from: string, to: string): number | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, (end - start) / 86_400_000);
}

function dueDays(dueDate: string | null | undefined, nowMs: number): number | null {
  if (!dueDate) return null;
  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) return null;
  return (due - nowMs) / 86_400_000;
}

function capacityStatus(workloadScore: number): StaffProductivityResult["capacityStatus"] {
  if (workloadScore >= 120) return "overloaded";
  if (workloadScore >= 85) return "busy";
  if (workloadScore >= 45) return "balanced";
  return "available";
}

export function calculateStaffProductivity(
  staff: StaffMember[],
  assignments: StaffProductivityAssignment[],
  now = new Date(),
): StaffProductivitySnapshot {
  const nowMs = now.getTime();
  const activeByStaff = new Map<string, StaffProductivityAssignment[]>();
  const completedByStaff = new Map<string, StaffProductivityAssignment[]>();

  for (const assignment of assignments) {
    if (assignment.status === "cancelled") continue;
    const target = assignment.status === "completed" ? completedByStaff : activeByStaff;
    const list = target.get(assignment.staffId) ?? [];
    list.push(assignment);
    target.set(assignment.staffId, list);
  }

  const results = staff
    .filter((member) => member.status === "active")
    .map<StaffProductivityResult>((member) => {
      const active = activeByStaff.get(member.id) ?? [];
      const completed = completedByStaff.get(member.id) ?? [];
      let overdueAssignments = 0;
      let dueSoonAssignments = 0;

      for (const assignment of active) {
        const days = dueDays(assignment.dueDate, nowMs);
        if (days != null && days < 0) overdueAssignments += 1;
        else if (days != null && days <= 2) dueSoonAssignments += 1;
      }

      const completionRate = completed.length + active.length > 0
        ? (completed.length / (completed.length + active.length)) * 100
        : 0;

      const completedDurations = completed
        .map((assignment) => assignment.completedAt ? diffDays(assignment.assignedAt, assignment.completedAt) : null)
        .filter((value): value is number => value != null);
      const averageCompletionDays = completedDurations.length > 0
        ? completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length
        : null;

      const onTimeCompleted = completed.filter((assignment) => {
        if (!assignment.dueDate || !assignment.completedAt) return true;
        const completedAt = Date.parse(assignment.completedAt);
        const dueAt = Date.parse(assignment.dueDate);
        return Number.isFinite(completedAt) && Number.isFinite(dueAt) ? completedAt <= dueAt : true;
      }).length;
      const onTimeRate = completed.length > 0 ? (onTimeCompleted / completed.length) * 100 : 0;

      // Capacity is intentionally transparent: active work + due-soon pressure + overdue pressure.
      const workloadScore = active.length * 15 + dueSoonAssignments * 10 + overdueAssignments * 20;

      return {
        staffId: member.id,
        staffName: member.name,
        activeAssignments: active.length,
        completedAssignments: completed.length,
        overdueAssignments,
        dueSoonAssignments,
        completionRate: Math.round(completionRate * 100) / 100,
        onTimeRate: Math.round(onTimeRate * 100) / 100,
        averageCompletionDays: averageCompletionDays == null ? null : Math.round(averageCompletionDays * 100) / 100,
        workloadScore: Math.round(finiteNonNegative(workloadScore) * 100) / 100,
        capacityStatus: capacityStatus(workloadScore),
      };
    })
    .sort((a, b) => b.workloadScore - a.workloadScore || a.staffName.localeCompare(b.staffName));

  const averageCompletionRate = results.length > 0
    ? results.reduce((sum, item) => sum + item.completionRate, 0) / results.length
    : 0;
  const averageOnTimeRate = results.length > 0
    ? results.reduce((sum, item) => sum + item.onTimeRate, 0) / results.length
    : 0;

  return {
    staff: results,
    totalActiveAssignments: results.reduce((sum, item) => sum + item.activeAssignments, 0),
    totalCompletedAssignments: results.reduce((sum, item) => sum + item.completedAssignments, 0),
    overloadedStaff: results.filter((item) => item.capacityStatus === "overloaded").length,
    averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
    averageOnTimeRate: Math.round(averageOnTimeRate * 100) / 100,
    generatedAt: now.toISOString(),
  };
}
