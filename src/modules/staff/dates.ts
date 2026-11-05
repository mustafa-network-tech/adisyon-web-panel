const DAY_MS = 86_400_000;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function format(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    isoDatePattern.test(value) &&
    !Number.isNaN(parse(value).getTime()) &&
    format(parse(value)) === value
  );
}

export function addDays(date: string, days: number) {
  return format(new Date(parse(date).getTime() + days * DAY_MS));
}

/** Monday of the week containing `date` (weeks run Monday to Sunday). */
export function weekStartOf(date: string) {
  const weekday = parse(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Today's date in the restaurant's time zone (Turkey). */
export function todayInTurkey(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function formatDay(date: string) {
  return dayFormatter.format(parse(date));
}

/** Shift length in minutes; an end before the start means it ends the next day. */
export function shiftMinutes(start: string, end: string) {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return (toMinutes(end) - toMinutes(start) + 1440) % 1440;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}
