import { CalendarClock, Palmtree } from "lucide-react";
import { formatDay, formatDuration, shiftMinutes } from "../dates";
import type { Shift } from "../types";

export function MyShifts({ shifts, today }: { shifts: Shift[]; today: string }) {
  return (
    <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent)]"><CalendarClock size={20} /></span>
        <div>
          <h2 className="text-lg font-black">Vardiyalarım</h2>
          <p className="text-xs font-semibold text-[#8a948f]">Önümüzdeki 4 hafta</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-[#edf0ee]">
        {shifts.map((shift) => {
          const isToday = shift.date === today;
          return (
            <li key={shift.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-3 ${isToday ? "rounded-xl bg-[#fff8f4] px-3" : ""}`}>
              <span className="w-28 text-sm font-black">{formatDay(shift.date)}{isToday && <span className="ml-2 rounded-md bg-[color:var(--c-accent)] px-1.5 py-0.5 text-[10px] text-white">Bugün</span>}</span>
              {shift.kind === "leave" ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#285e9f]"><Palmtree size={15} />İzinli</span>
              ) : (
                <span className="text-sm font-bold">{shift.startTime}–{shift.endTime}
                  <span className="ml-2 text-xs font-semibold text-[#8a948f]">{formatDuration(shiftMinutes(shift.startTime || "00:00", shift.endTime || "00:00"))}</span>
                </span>
              )}
              <span className="text-xs font-semibold text-[#8a948f]">{shift.branchName}</span>
              {shift.notes && <span className="w-full text-xs font-semibold text-[#68736e] sm:w-auto">{shift.notes}</span>}
            </li>
          );
        })}
        {shifts.length === 0 && <li className="py-8 text-center text-sm font-semibold text-[#8a948f]">Önümüzdeki günler için planlanmış vardiyanız yok.</li>}
      </ul>
    </section>
  );
}
