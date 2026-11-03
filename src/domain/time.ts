import { DomainError, invariant } from "./errors";

export const MINIMUM_LEAD_TIME_MS = 60 * 60 * 1000;
export const MAX_BOOKING_HORIZON_MS = 42 * 24 * 60 * 60 * 1000;
export const PROVISIONAL_TTL_MS = 15 * 60 * 1000;

export function validInstant(value: string): number {
  const time = Date.parse(value);
  invariant(Number.isFinite(time), `Fecha inválida: ${value}`);
  return time;
}

export function localDateTime(
  instant: number,
  timeZone: string,
): { date: string; time: string; weekday: number } {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(instant)
        .map((part) => [part.type, part.value]),
    );
  } catch {
    throw new DomainError("INVALID_INPUT", `Zona horaria inválida: ${timeZone}`);
  }
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday,
  };
}

export function zonedDateTimeToInstant(date: string, time: string, timeZone: string): number {
  invariant(
    /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time),
    "Fecha u hora local inválida",
  );
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  invariant(
    month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour < 24 && minute < 60,
    "Fecha u hora fuera de rango",
  );
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  // Iterative offset correction handles ordinary timezone offsets and DST boundaries.
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    const correction = target - represented;
    if (correction === 0) break;
    guess += correction;
  }
  const resolved = localDateTime(guess, timeZone);
  if (resolved.date !== date || resolved.time !== time)
    throw new DomainError("NONEXISTENT_LOCAL_TIME", "La hora local no existe en esta zona horaria");
  return guess;
}
