import { DomainError, invariant } from "./errors";
import {
  localDateTime,
  MAX_BOOKING_HORIZON_MS,
  MINIMUM_LEAD_TIME_MS,
  validInstant,
  zonedDateTimeToInstant,
} from "./time";
import type { Booking, BusinessConfig, ScheduleException, ServiceVisit } from "./types";

const NON_BLOCKING = new Set<Booking["status"]>(["EXPIRED", "REJECTED", "CANCELLED", "NO_SHOW"]);
const minutes = (value: string) => {
  invariant(/^\d{2}:\d{2}$/.test(value), `Hora inválida: ${value}`);
  const [h, m] = value.split(":").map(Number);
  invariant(h < 24 && m < 60, `Hora inválida: ${value}`);
  return h * 60 + m;
};

export function expireProvisionalBookings(bookings: Booking[], now: string): Booking[] {
  const nowMs = validInstant(now);
  return bookings.map((booking) => {
    if (booking.status !== "AWAITING_PAYMENT_NOTICE") return booking;
    invariant(typeof booking.expiresAt === "string", "La reserva provisional requiere vencimiento");
    return validInstant(booking.expiresAt) <= nowMs ? { ...booking, status: "EXPIRED" } : booking;
  });
}

export function getAvailableSlots(input: {
  config: BusinessConfig;
  bookings: Booking[];
  visits?: readonly ServiceVisit[];
  /** When supplied, availability is checked only for this barber. */
  barberId?: string;
  date: string;
  durationMinutes: number;
  now: string;
}): string[] {
  const { config, date, durationMinutes } = input;
  invariant(
    Number.isInteger(durationMinutes) && durationMinutes > 0,
    "La duración debe ser positiva",
  );
  const now = validInstant(input.now);
  const targetDate = zonedDateTimeToInstant(date, "12:00", config.timeZone);
  const weekday = localDateTime(targetDate, config.timeZone).weekday;
  const exception = config.exceptions.find((item) => item.date === date);
  if (exception?.closed) return [];
  const rule = config.schedule.find((item) => item.weekday === weekday);
  const window = scheduleWindow(rule, exception);
  if (!window) return [];
  const open = minutes(window.start);
  const close = minutes(window.end);
  const breaks = (window.breaks ?? []).map(
    (item) => [minutes(item.start), minutes(item.end)] as const,
  );
  const effectiveBookings = expireProvisionalBookings(input.bookings, input.now).filter(
    (booking) =>
      !NON_BLOCKING.has(booking.status) && (!input.barberId || booking.barberId === input.barberId),
  );
  const occupied = effectiveBookings.map(
    (booking) => [validInstant(booking.startsAt), validInstant(booking.endsAt)] as const,
  );
  const occupiedByVisits = (input.visits ?? [])
    .filter(
      (visit) =>
        visit.blocksAvailability !== false &&
        visit.startsAt &&
        visit.endsAt &&
        (!input.barberId || !visit.barberId || visit.barberId === input.barberId),
    )
    .map((visit) => {
      const startsAt = validInstant(visit.startsAt!);
      const endsAt = validInstant(visit.endsAt!);
      invariant(endsAt > startsAt, `Intervalo inválido en atención ${visit.id}`);
      return [startsAt, endsAt] as const;
    });
  occupied.push(...occupiedByVisits);
  const slots: string[] = [];
  for (let start = Math.ceil(open / 30) * 30; start + durationMinutes <= close; start += 30) {
    const end = start + durationMinutes;
    if (breaks.some(([a, b]) => start < b && end > a)) continue;
    let startsAt: number;
    try {
      startsAt = zonedDateTimeToInstant(
        date,
        `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
        config.timeZone,
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === "NONEXISTENT_LOCAL_TIME") continue;
      throw error;
    }
    const endsAt = startsAt + durationMinutes * 60_000;
    if (startsAt < now + MINIMUM_LEAD_TIME_MS || startsAt > now + MAX_BOOKING_HORIZON_MS) continue;
    if (occupied.some(([a, b]) => startsAt < b && endsAt > a)) continue;
    slots.push(new Date(startsAt).toISOString());
  }
  return slots;
}

function scheduleWindow(
  rule: BusinessConfig["schedule"][number] | undefined,
  exception: ScheduleException | undefined,
) {
  if (!rule && !(exception?.start && exception.end)) return undefined;
  return {
    start: exception?.start ?? rule!.start,
    end: exception?.end ?? rule!.end,
    breaks: exception?.breaks ?? rule?.breaks,
  };
}

export function assertSlotAvailable(
  input: Parameters<typeof getAvailableSlots>[0],
  startsAt: string,
): void {
  if (!getAvailableSlots(input).includes(new Date(validInstant(startsAt)).toISOString())) {
    throw new DomainError("SLOT_UNAVAILABLE", "El horario ya no está disponible");
  }
}

export function isBlockingBooking(status: Booking["status"]): boolean {
  return !NON_BLOCKING.has(status);
}
