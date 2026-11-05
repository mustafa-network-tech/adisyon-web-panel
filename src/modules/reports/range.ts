import { addDays, isIsoDate, weekStartOf } from "@/modules/staff/dates";

export type ReportPreset = "today" | "yesterday" | "week" | "last7" | "month";

/** Resolves ?from & ?to (or a preset) to a valid range; falls back to today. */
export function resolveRange(input: { from?: string; to?: string; preset?: string }, today: string) {
  const presets: Record<ReportPreset, [string, string]> = {
    today: [today, today],
    yesterday: [addDays(today, -1), addDays(today, -1)],
    week: [weekStartOf(today), today],
    last7: [addDays(today, -6), today],
    month: [`${today.slice(0, 7)}-01`, today],
  };
  if (input.preset && input.preset in presets) return presets[input.preset as ReportPreset];
  if (isIsoDate(input.from) && isIsoDate(input.to) && input.from <= input.to) return [input.from, input.to] as [string, string];
  return presets.today;
}
