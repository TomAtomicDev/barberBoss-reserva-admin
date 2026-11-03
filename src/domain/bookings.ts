import { DomainError, invariant } from "./errors";
import { assertSlotAvailable, expireProvisionalBookings } from "./scheduling";
import { localDateTime, PROVISIONAL_TTL_MS, validInstant } from "./time";
import { hasCentavoPrecision } from "./money";
import type { Booking, CreateBookingInput, DomainState } from "./types";

export function createBooking(state: DomainState, input: CreateBookingInput): Booking {
  const now = validInstant(input.now);
  const starts = validInstant(input.startsAt);
  invariant(
    input.id && input.code && input.customer.name.trim() && input.customer.phone.trim(),
    "Faltan datos obligatorios de la reserva",
  );
  invariant(input.serviceIds.length > 0, "Selecciona al menos un servicio");
  const services = input.serviceIds.map((id) => {
    const service = state.services.find((item) => item.id === id && item.active);
    if (!service) throw new DomainError("NOT_FOUND", `Servicio no disponible: ${id}`);
    if (service.requiresConsultation)
      throw new DomainError(
        "CONSULTATION_REQUIRED",
        `El servicio ${service.name} requiere consulta`,
      );
    invariant(
      hasCentavoPrecision(service.price) && service.price >= 0 && service.durationMinutes > 0,
      "Servicio inválido",
    );
    return service;
  });
  const items = services.map(({ id, name, price, durationMinutes }) => ({
    serviceId: id,
    name,
    price,
    durationMinutes,
  }));
  const durationMinutes = items.reduce((sum, item) => sum + item.durationMinutes, 0);
  const currentBookings = expireProvisionalBookings(state.bookings, input.now);
  assertSlotAvailable(
    {
      config: state.business,
      bookings: currentBookings,
      visits: state.visits,
      date: localDateTime(starts, state.business.timeZone).date,
      durationMinutes,
      now: input.now,
    },
    input.startsAt,
  );
  return {
    id: input.id,
    code: input.code,
    customer: {
      ...input.customer,
      ...(input.customer.preferences ? { preferences: { ...input.customer.preferences } } : {}),
    },
    barberId: input.barberId,
    source: input.source,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(starts + durationMinutes * 60_000).toISOString(),
    status: "AWAITING_PAYMENT_NOTICE",
    items,
    totalPrice: items.reduce((sum, item) => sum + item.price, 0),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PROVISIONAL_TTL_MS).toISOString(),
  };
}

export function reevaluateBookingExpirations(state: DomainState, now: string): DomainState {
  return { ...state, bookings: expireProvisionalBookings(state.bookings, now) };
}

export function declarePayment(
  state: DomainState,
  bookingId: string,
  payment: { id: string; amount: number; method: "BANK_TRANSFER" | "CASH" | "OTHER"; now: string },
): DomainState {
  const bookings = expireProvisionalBookings(state.bookings, payment.now);
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) throw new DomainError("NOT_FOUND", "Reserva no encontrada");
  if (booking.status === "EXPIRED")
    throw new DomainError("BOOKING_EXPIRED", "La reserva venció; elige otro horario");
  if (booking.status !== "AWAITING_PAYMENT_NOTICE")
    throw new DomainError("INVALID_TRANSITION", "La reserva no admite declarar un pago");
  invariant(
    hasCentavoPrecision(payment.amount) && payment.amount > 0,
    "El importe debe ser positivo y tener máximo dos decimales",
  );
  const updated = bookings.map((item) =>
    item.id === bookingId ? { ...item, status: "PENDING_VERIFICATION" as const } : item,
  );
  return {
    ...state,
    bookings: updated,
    payments: [
      ...state.payments,
      {
        ...payment,
        bookingId,
        status: "DECLARED",
        createdAt: new Date(validInstant(payment.now)).toISOString(),
      },
    ],
  };
}

export function transitionBooking(
  bookings: Booking[],
  bookingId: string,
  next: Booking["status"],
): Booking[] {
  const allowed: Partial<Record<Booking["status"], Booking["status"][]>> = {
    PENDING_VERIFICATION: ["CONFIRMED", "REJECTED", "CANCELLED"],
    CONFIRMED: ["CANCELLED", "NO_SHOW", "COMPLETED"],
    AWAITING_PAYMENT_NOTICE: ["CANCELLED"],
  };
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) throw new DomainError("NOT_FOUND", "Reserva no encontrada");
  if (!allowed[booking.status]?.includes(next))
    throw new DomainError(
      "INVALID_TRANSITION",
      `Transición no permitida: ${booking.status} → ${next}`,
    );
  return bookings.map((item) =>
    item.id === bookingId ? { ...item, status: next, ...(next === "COMPLETED" ? {} : {}) } : item,
  );
}

export function reassignBookingTime(
  bookings: Booking[],
  bookingId: string,
  startsAt: string,
  endsAt: string,
): Booking[] {
  validInstant(startsAt);
  validInstant(endsAt);
  invariant(validInstant(endsAt) > validInstant(startsAt), "El fin debe ser posterior al inicio");
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking) throw new DomainError("NOT_FOUND", "Reserva no encontrada");
  return bookings.map((item) =>
    item.id === bookingId
      ? {
          ...item,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }
      : item,
  );
}
