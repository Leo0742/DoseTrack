export type DaySummary = { taken: number; skipped: number; pending: number };

export function calendarState(day?: DaySummary): "none" | "complete" | "partial" | "skipped" {
  if (!day) return "none";
  if (day.pending > 0) return "partial";
  if (day.taken > 0 && day.skipped === 0) return "complete";
  if (day.taken === 0 && day.skipped > 0) return "skipped";
  return "partial";
}

export function isOverdue(status: string, scheduledDate: string, plannedTime: string, now: Date): boolean {
  if (status !== "PENDING") return false;
  const scheduled = new Date(`${scheduledDate}T${plannedTime.slice(0, 8) || plannedTime}`);
  return Number.isFinite(scheduled.getTime()) && scheduled.getTime() < now.getTime();
}
