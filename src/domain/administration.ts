import { DomainError, invariant } from "./errors";
import { assertSlotAvailable } from "./scheduling";
import { localDateTime, validInstant } from "./time";
import { hasCentavoPrecision } from "./money";
import { addMovementOnce, completeVisit, refundPayment, verifyPayment } from "./ledger";
import { createBooking, transitionBooking } from "./bookings";
import type {
  Booking,
  BookingEvent,
  CreatePhoneBookingInput,
  Customer,
  DomainState,
  PaymentMethod,
  ProductSale,
  ServiceVisit,
  ServiceVisitItem,
} from "./types";

function event(state: DomainState, details: Omit<BookingEvent, "id">): DomainState {
  const entry = {
    ...details,
    id: `event:${details.bookingId}:${details.action}:${details.occurredAt}:${state.bookingEvents.length}`,
  };
  return { ...state, bookingEvents: [...state.bookingEvents, entry] };
}

export function createPhoneBooking(
  state: DomainState,
  input: CreatePhoneBookingInput,
): DomainState {
  if (input.source !== "PHONE")
    throw new DomainError("INVALID_INPUT", "Una reserva administrativa debe tener origen PHONE");
  const services = state.services.map((service) => {
    const agreement = input.agreedServices?.find((item) => item.serviceId === service.id);
    if (!agreement) return service;
    invariant(
      hasCentavoPrecision(agreement.price) && agreement.price >= 0 && agreement.durationMinutes > 0,
      "Precio o duración acordados inválidos",
    );
    return {
      ...service,
      name: agreement.name ?? service.name,
      price: agreement.price,
      durationMinutes: agreement.durationMinutes,
      requiresConsultation: false,
    };
  });
  const created = createBooking({ ...state, services }, input);
  const booking: Booking = { ...created, status: "CONFIRMED", expiresAt: undefined };
  return event(
    upsertCustomer({ ...state, bookings: [...state.bookings, booking] }, booking.customer),
    {
      bookingId: booking.id,
      action: "CREATED_BY_PHONE",
      actor: "OWNER",
      occurredAt: input.now,
      changes: { status: booking.status, startsAt: booking.startsAt },
    },
  );
}

export function approveBooking(
  state: DomainState,
  bookingId: string,
  paymentId: string,
  now: string,
): DomainState {
  const booking = requireBooking(state, bookingId);
  invariant(
    booking.status === "PENDING_VERIFICATION",
    "La reserva no está pendiente de verificación",
  );
  const payment = state.payments.find(
    (item) => item.id === paymentId && item.bookingId === bookingId,
  );
  if (!payment) throw new DomainError("NOT_FOUND", "Pago de la reserva no encontrado");
  let next = verifyPayment(state, paymentId, now);
  next = { ...next, bookings: transitionBooking(next.bookings, bookingId, "CONFIRMED") };
  return event(next, {
    bookingId,
    action: "APPROVED",
    actor: "OWNER",
    occurredAt: now,
    changes: { paymentId },
  });
}

export function rejectBooking(
  state: DomainState,
  bookingId: string,
  now: string,
  reason?: string,
): DomainState {
  requireBooking(state, bookingId);
  let next = { ...state, bookings: transitionBooking(state.bookings, bookingId, "REJECTED") };
  next = {
    ...next,
    payments: next.payments.map((payment) =>
      payment.bookingId === bookingId && payment.status === "DECLARED"
        ? { ...payment, status: "REJECTED" }
        : payment,
    ),
  };
  return event(next, {
    bookingId,
    action: "REJECTED_AND_RELEASED",
    actor: "OWNER",
    occurredAt: now,
    reason,
  });
}

export function releaseBooking(
  state: DomainState,
  bookingId: string,
  now: string,
  reason?: string,
): DomainState {
  requireBooking(state, bookingId);
  const next = { ...state, bookings: transitionBooking(state.bookings, bookingId, "CANCELLED") };
  return event(next, { bookingId, action: "RELEASED", actor: "OWNER", occurredAt: now, reason });
}

export function cancelBooking(
  state: DomainState,
  bookingId: string,
  now: string,
  reason?: string,
  actor: BookingEvent["actor"] = "OWNER",
): DomainState {
  const next = { ...state, bookings: transitionBooking(state.bookings, bookingId, "CANCELLED") };
  return event(next, { bookingId, action: "CANCELLED", actor, occurredAt: now, reason });
}

export function markNoShow(
  state: DomainState,
  bookingId: string,
  now: string,
  reason?: string,
): DomainState {
  const next = { ...state, bookings: transitionBooking(state.bookings, bookingId, "NO_SHOW") };
  return event(next, { bookingId, action: "NO_SHOW", actor: "OWNER", occurredAt: now, reason });
}

export function rescheduleBooking(
  state: DomainState,
  bookingId: string,
  startsAt: string,
  now: string,
  reason?: string,
): DomainState {
  const booking = requireBooking(state, bookingId);
  invariant(
    booking.status === "CONFIRMED" || booking.status === "PENDING_VERIFICATION",
    "Solo se puede reprogramar una reserva activa",
  );
  const duration = booking.items.reduce((total, item) => total + item.durationMinutes, 0);
  const date = localDateTime(validInstant(startsAt), state.business.timeZone).date;
  assertSlotAvailable(
    {
      config: state.business,
      bookings: state.bookings.filter((item) => item.id !== bookingId),
      visits: state.visits,
      barberId: booking.barberId,
      date,
      durationMinutes: duration,
      now,
    },
    startsAt,
  );
  const oldStartsAt = booking.startsAt;
  const bookings = state.bookings.map((item) =>
    item.id === bookingId
      ? {
          ...item,
          startsAt: new Date(validInstant(startsAt)).toISOString(),
          endsAt: new Date(validInstant(startsAt) + duration * 60_000).toISOString(),
        }
      : item,
  );
  return event(
    { ...state, bookings },
    {
      bookingId,
      action: "RESCHEDULED",
      actor: "OWNER",
      occurredAt: now,
      reason,
      changes: { from: oldStartsAt, to: startsAt },
    },
  );
}

export function createWalkInVisit(state: DomainState, visit: ServiceVisit): DomainState {
  invariant(!visit.bookingId, "Una atención walk-in no debe enlazar una reserva");
  const next = completeVisit(state, visit);
  return {
    ...next,
    visits: next.visits.map((item) =>
      item.id === visit.id ? { ...item, bookingId: undefined } : item,
    ),
  };
}

/** Adds or updates a local customer profile, including walk-ins without a booking. */
export function upsertCustomer(state: DomainState, customer: Customer): DomainState {
  invariant(isCustomerInputValid(customer), "Datos de cliente inválidos");
  const customers = state.customers ?? [];
  const index = customers.findIndex((item) => item.id === customer.id);
  const nextCustomers =
    index < 0
      ? [...customers, structuredClone(customer)]
      : customers.map((item) => (item.id === customer.id ? structuredClone(customer) : item));
  return { ...state, customers: nextCustomers };
}

function isCustomerInputValid(customer: Customer): boolean {
  if (typeof customer.id !== "string" || !customer.id.trim()) return false;
  if (typeof customer.name !== "string" || !customer.name.trim()) return false;
  if (typeof customer.phone !== "string") return false;
  if (customer.email !== undefined && typeof customer.email !== "string") return false;
  const notes = customer.preferences?.notes;
  if (notes !== undefined && (typeof notes !== "string" || notes.length > 300)) return false;
  const link = customer.preferences?.musicLink;
  if (link !== undefined && (typeof link !== "string" || link.length > 300)) return false;
  if (link) {
    try {
      const protocol = new URL(link).protocol;
      if (protocol !== "http:" && protocol !== "https:") return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function addVisitItem(
  state: DomainState,
  visitId: string,
  item: ServiceVisitItem,
): DomainState {
  invariant(
    item.name.trim() !== "" &&
      hasCentavoPrecision(item.price) &&
      item.price >= 0 &&
      item.durationMinutes > 0,
    "Servicio adicional inválido",
  );
  const visit = state.visits.find((candidate) => candidate.id === visitId);
  if (!visit) throw new DomainError("NOT_FOUND", "Atención no encontrada");
  const items = [...visit.items, { ...item }];
  return {
    ...state,
    visits: state.visits.map((candidate) =>
      candidate.id === visitId
        ? { ...candidate, items, totalPrice: items.reduce((sum, value) => sum + value.price, 0) }
        : candidate,
    ),
  };
}

export function recordInStorePayment(
  state: DomainState,
  input: { id: string; bookingId?: string; amount: number; method: PaymentMethod; now: string },
): DomainState {
  invariant(hasCentavoPrecision(input.amount) && input.amount > 0, "Importe de pago inválido");
  if (input.bookingId) requireBooking(state, input.bookingId);
  invariant(!state.payments.some((item) => item.id === input.id), "El pago ya existe");
  const payment = {
    id: input.id,
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    amount: input.amount,
    method: input.method,
    status: "VERIFIED" as const,
    createdAt: new Date(validInstant(input.now)).toISOString(),
  };
  return {
    ...state,
    payments: [...state.payments, payment],
    movements: addMovementOnce(state.movements, {
      id: `payment:${payment.id}`,
      kind: "PAYMENT_IN",
      paymentId: payment.id,
      amount: payment.amount,
      occurredAt: payment.createdAt,
    }),
  };
}

export function recordProductSale(
  state: DomainState,
  input: Omit<ProductSale, "occurredAt"> & { occurredAt: string },
): DomainState {
  invariant(
    input.description.trim() !== "" &&
      Number.isInteger(input.quantity) &&
      input.quantity > 0 &&
      hasCentavoPrecision(input.amount) &&
      input.amount > 0,
    "Venta inválida",
  );
  invariant(!state.sales.some((sale) => sale.id === input.id), "La venta ya existe");
  const sale = { ...input, occurredAt: new Date(validInstant(input.occurredAt)).toISOString() };
  return {
    ...state,
    sales: [...state.sales, sale],
    movements: addMovementOnce(state.movements, {
      id: `sale:${sale.id}`,
      kind: "SALE_IN",
      amount: sale.amount,
      occurredAt: sale.occurredAt,
      description: sale.description,
    }),
  };
}

export function refund(
  state: DomainState,
  paymentId: string,
  amount: number,
  now: string,
  movementId: string,
): DomainState {
  return refundPayment(state, paymentId, amount, now, movementId);
}

export function updateBusinessConfig(
  state: DomainState,
  business: DomainState["business"],
): DomainState {
  invariant(business.name.trim() !== "", "El nombre del negocio es obligatorio");
  invariant(
    !!business.barber.id && business.barber.name.trim() !== "",
    "El barbero requiere identificador y nombre",
  );
  invariant(!!business.timeZone, "La zona horaria es obligatoria");
  new Intl.DateTimeFormat("en", { timeZone: business.timeZone });
  for (const rule of business.schedule) {
    invariant(
      Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6,
      "Día de semana inválido",
    );
    validateWindow(rule.start, rule.end, rule.breaks ?? []);
  }
  for (const exception of business.exceptions) {
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(exception.date), "Fecha de excepción inválida");
    if (exception.start && exception.end)
      validateWindow(exception.start, exception.end, exception.breaks ?? []);
    else if (exception.breaks) validateBreakRanges(exception.breaks);
  }
  return { ...state, business: structuredClone(business) };
}

function validateWindow(start: string, end: string, breaks: Array<{ start: string; end: string }>) {
  const toMinutes = (time: string) => {
    invariant(/^\d{2}:\d{2}$/.test(time), "Hora inválida");
    const [hour, minute] = time.split(":").map(Number);
    invariant(hour < 24 && minute < 60, "Hora inválida");
    return hour * 60 + minute;
  };
  const open = toMinutes(start);
  const close = toMinutes(end);
  invariant(open < close, "El cierre debe ser posterior a la apertura");
  for (const pause of breaks)
    invariant(
      toMinutes(pause.start) < toMinutes(pause.end) &&
        toMinutes(pause.start) >= open &&
        toMinutes(pause.end) <= close,
      "Pausa fuera del horario",
    );
}

function validateBreakRanges(breaks: Array<{ start: string; end: string }>) {
  for (const pause of breaks)
    invariant(minuteOf(pause.start) < minuteOf(pause.end), "Intervalo de pausa inválido");
}

function minuteOf(time: string) {
  invariant(/^\d{2}:\d{2}$/.test(time), "Hora inválida");
  const [hour, minute] = time.split(":").map(Number);
  invariant(hour! < 24 && minute! < 60, "Hora inválida");
  return hour! * 60 + minute!;
}

function requireBooking(state: DomainState, id: string): Booking {
  const booking = state.bookings.find((candidate) => candidate.id === id);
  if (!booking) throw new DomainError("NOT_FOUND", "Reserva no encontrada");
  return booking;
}
