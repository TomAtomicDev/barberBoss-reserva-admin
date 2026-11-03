import { invariant } from "./errors";
import { hasCentavoPrecision } from "./money";
import { validInstant } from "./time";
import type {
  Booking,
  BookingEvent,
  BookingStatus,
  DomainState,
  MovementKind,
  Payment,
  PaymentMethod,
  PaymentStatus,
  ServiceVisit,
} from "./types";

const BOOKING_STATUSES: BookingStatus[] = [
  "AWAITING_PAYMENT_NOTICE",
  "PENDING_VERIFICATION",
  "CONFIRMED",
  "EXPIRED",
  "REJECTED",
  "CANCELLED",
  "NO_SHOW",
  "COMPLETED",
];
const PAYMENT_STATUSES: PaymentStatus[] = ["DECLARED", "VERIFIED", "REJECTED", "REFUNDED"];
const PAYMENT_METHODS: PaymentMethod[] = ["BANK_TRANSFER", "CASH", "OTHER"];
const MOVEMENT_KINDS: MovementKind[] = [
  "PAYMENT_IN",
  "REFUND_OUT",
  "SALE_IN",
  "MANUAL_IN",
  "MANUAL_OUT",
];
const ACTORS: BookingEvent["actor"][] = ["CUSTOMER", "OWNER", "BARBER", "SYSTEM"];

export function validateDomainState(value: unknown): value is DomainState {
  invariant(isRecord(value), "Datos del demo inválidos");
  const state = value as Partial<DomainState>;
  invariant(
    Array.isArray(state.services) &&
      Array.isArray(state.bookings) &&
      Array.isArray(state.payments) &&
      Array.isArray(state.visits) &&
      Array.isArray(state.movements) &&
      Array.isArray(state.bookingEvents) &&
      Array.isArray(state.sales) &&
      isRecord(state.business),
    "Estructura del demo incompleta",
  );
  const business = state.business;
  invariant(
    typeof business.name === "string" && !!business.name.trim(),
    "Nombre del negocio no definido",
  );
  invariant(
    isRecord(business.barber) && string(business.barber.id) && string(business.barber.name),
    "Barbero no definido",
  );
  invariant(
    typeof business.timeZone === "string" && !!business.timeZone,
    "Zona horaria no definida",
  );
  try {
    new Intl.DateTimeFormat("en", { timeZone: business.timeZone });
  } catch {
    invariant(false, "Zona horaria inválida");
  }
  invariant(
    Array.isArray(business.schedule) && Array.isArray(business.exceptions),
    "Configuración de agenda inválida",
  );

  for (const service of state.services) {
    invariant(
      isRecord(service) &&
        string(service.id) &&
        string(service.name) &&
        typeof service.active === "boolean" &&
        typeof service.requiresConsultation === "boolean" &&
        finite(service.price) &&
        hasCentavoPrecision(service.price) &&
        service.price >= 0 &&
        Number.isInteger(service.durationMinutes) &&
        (service.requiresConsultation || service.durationMinutes > 0),
      "Servicio inválido",
    );
  }
  if (state.customers !== undefined) {
    invariant(Array.isArray(state.customers), "Colección de clientes inválida");
    const customerIds = new Set<string>();
    for (const customer of state.customers) {
      invariant(isCustomer(customer), "Cliente inválido");
      invariant(!customerIds.has(customer.id), "Identificador de cliente duplicado");
      customerIds.add(customer.id);
    }
  }
  for (const rule of business.schedule) {
    invariant(
      isRecord(rule) && Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6,
      "Regla de horario inválida",
    );
    validateWindow(rule.start, rule.end, rule.breaks ?? []);
  }
  for (const exception of business.exceptions) {
    invariant(isRecord(exception) && isDate(exception.date), "Excepción de agenda inválida");
    invariant(
      exception.closed === undefined || typeof exception.closed === "boolean",
      "Cierre de excepción inválido",
    );
    invariant(
      (exception.start === undefined) === (exception.end === undefined),
      "La excepción debe indicar apertura y cierre juntos",
    );
    if (exception.start !== undefined && exception.end !== undefined) {
      validateWindow(exception.start, exception.end, exception.breaks ?? []);
    } else {
      validateBreaks(exception.breaks ?? []);
    }
  }

  const bookingIds = new Set<string>();
  for (const booking of state.bookings) {
    validateBooking(booking);
    invariant(!bookingIds.has(booking.id), "Identificador de reserva duplicado");
    bookingIds.add(booking.id);
  }
  const paymentIds = new Set<string>();
  for (const payment of state.payments) {
    validatePayment(payment);
    invariant(!paymentIds.has(payment.id), "Identificador de pago duplicado");
    paymentIds.add(payment.id);
    invariant(
      !payment.bookingId || bookingIds.has(payment.bookingId),
      "Pago asociado a una reserva inexistente",
    );
  }
  const visitIds = new Set<string>();
  const visitedBookingIds = new Set<string>();
  for (const visit of state.visits) {
    validateVisit(visit);
    invariant(!visitIds.has(visit.id), "Identificador de atención duplicado");
    visitIds.add(visit.id);
    invariant(
      !visit.bookingId || bookingIds.has(visit.bookingId),
      "Atención asociada a una reserva inexistente",
    );
    if (visit.bookingId) {
      invariant(
        !visitedBookingIds.has(visit.bookingId),
        "Una reserva no puede tener más de una atención",
      );
      visitedBookingIds.add(visit.bookingId);
    }
    invariant(
      !visit.customerId ||
        state.customers === undefined ||
        state.customers.some((customer) => customer.id === visit.customerId),
      "Atención asociada a un cliente inexistente",
    );
  }
  const movementIds = new Set<string>();
  for (const movement of state.movements) {
    invariant(
      isRecord(movement) &&
        string(movement.id) &&
        includes(MOVEMENT_KINDS, movement.kind) &&
        finite(movement.amount) &&
        hasCentavoPrecision(movement.amount) &&
        movement.amount > 0,
      "Movimiento inválido",
    );
    validInstant(movement.occurredAt);
    invariant(!movementIds.has(movement.id), "Identificador de movimiento duplicado");
    movementIds.add(movement.id);
    invariant(
      !movement.paymentId || paymentIds.has(movement.paymentId),
      "Movimiento asociado a un pago inexistente",
    );
    invariant(
      !movement.visitId || visitIds.has(movement.visitId),
      "Movimiento asociado a una atención inexistente",
    );
  }
  for (const entry of state.bookingEvents) {
    invariant(
      isRecord(entry) &&
        string(entry.id) &&
        string(entry.bookingId) &&
        bookingIds.has(entry.bookingId) &&
        string(entry.action) &&
        includes(ACTORS, entry.actor),
      "Evento de reserva inválido",
    );
    validInstant(entry.occurredAt);
  }
  const saleIds = new Set<string>();
  for (const sale of state.sales) {
    invariant(
      isRecord(sale) &&
        string(sale.id) &&
        string(sale.description) &&
        Number.isInteger(sale.quantity) &&
        sale.quantity > 0 &&
        finite(sale.amount) &&
        hasCentavoPrecision(sale.amount) &&
        sale.amount > 0 &&
        (sale.method === undefined || includes(PAYMENT_METHODS, sale.method)),
      "Venta inválida",
    );
    validInstant(sale.occurredAt);
    invariant(!saleIds.has(sale.id), "Identificador de venta duplicado");
    saleIds.add(sale.id);
  }
  return true;
}

function validateBooking(value: unknown): asserts value is Booking {
  invariant(
    isRecord(value) &&
      string(value.id) &&
      string(value.code) &&
      isCustomer(value.customer) &&
      string(value.barberId) &&
      includes(["WEB", "PHONE", "WALK_IN"] as const, value.source) &&
      includes(BOOKING_STATUSES, value.status) &&
      Array.isArray(value.items) &&
      value.items.length > 0,
    "Reserva o cliente inválido",
  );
  const booking = value as unknown as Booking;
  invariant(
    validInstant(booking.endsAt) > validInstant(booking.startsAt),
    "Intervalo de reserva inválido",
  );
  validInstant(booking.createdAt);
  if (booking.status === "AWAITING_PAYMENT_NOTICE")
    invariant(typeof booking.expiresAt === "string", "La reserva provisional requiere vencimiento");
  if (booking.expiresAt !== undefined) validInstant(booking.expiresAt);
  for (const item of booking.items)
    invariant(
      isRecord(item) &&
        string(item.serviceId) &&
        string(item.name) &&
        finite(item.price) &&
        hasCentavoPrecision(item.price) &&
        item.price >= 0 &&
        Number.isInteger(item.durationMinutes) &&
        item.durationMinutes > 0,
      "Snapshot de servicio inválido",
    );
  invariant(
    finite(booking.totalPrice) &&
      hasCentavoPrecision(booking.totalPrice) &&
      booking.totalPrice === booking.items.reduce((total, item) => total + item.price, 0),
    "Total de reserva inconsistente",
  );
}

function isCustomer(value: unknown): boolean {
  if (!isRecord(value) || !string(value.id) || !string(value.name) || !string(value.phone))
    return false;
  if (value.email !== undefined && typeof value.email !== "string") return false;
  if (value.preferences === undefined) return true;
  if (!isRecord(value.preferences)) return false;
  const { notes, musicLink } = value.preferences;
  if (notes !== undefined && (typeof notes !== "string" || notes.length > 300)) return false;
  if (musicLink !== undefined) {
    if (typeof musicLink !== "string" || musicLink.length > 300) return false;
    if (musicLink !== "") {
      try {
        const url = new URL(musicLink);
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

function validatePayment(value: unknown): asserts value is Payment {
  invariant(
    isRecord(value) &&
      string(value.id) &&
      (value.bookingId === undefined || string(value.bookingId)) &&
      finite(value.amount) &&
      hasCentavoPrecision(value.amount) &&
      value.amount > 0 &&
      includes(PAYMENT_METHODS, value.method) &&
      includes(PAYMENT_STATUSES, value.status),
    "Pago inválido",
  );
  validInstant((value as unknown as Payment).createdAt);
}

function validateVisit(value: unknown): asserts value is ServiceVisit {
  invariant(
    isRecord(value) &&
      string(value.id) &&
      (value.bookingId === undefined || string(value.bookingId)) &&
      (value.customerId === undefined || string(value.customerId)) &&
      Array.isArray(value.items) &&
      value.items.length > 0 &&
      finite(value.totalPrice) &&
      hasCentavoPrecision(value.totalPrice) &&
      (value.blocksAvailability === undefined || typeof value.blocksAvailability === "boolean"),
    "Atención inválida",
  );
  const visit = value as unknown as ServiceVisit;
  validInstant(visit.completedAt);
  invariant(
    (visit.startsAt === undefined) === (visit.endsAt === undefined),
    "La atención debe incluir inicio y fin como pareja",
  );
  if (visit.startsAt && visit.endsAt)
    invariant(
      validInstant(visit.endsAt) > validInstant(visit.startsAt),
      "Intervalo de atención inválido",
    );
  invariant(
    visit.blocksAvailability !== true || !!visit.startsAt,
    "Una atención bloqueante requiere intervalo",
  );
  for (const item of visit.items)
    invariant(
      isRecord(item) &&
        (item.serviceId === undefined || string(item.serviceId)) &&
        string(item.name) &&
        finite(item.price) &&
        hasCentavoPrecision(item.price) &&
        item.price >= 0 &&
        Number.isInteger(item.durationMinutes) &&
        item.durationMinutes > 0,
      "Servicio realizado inválido",
    );
  invariant(
    hasCentavoPrecision(visit.totalPrice) &&
      visit.totalPrice === visit.items.reduce((total, item) => total + item.price, 0),
    "Total de atención inconsistente",
  );
}

function validateWindow(start: unknown, end: unknown, breaks: unknown) {
  const open = minuteOf(start);
  const close = minuteOf(end);
  invariant(open < close && Array.isArray(breaks), "Ventana de agenda inválida");
  for (const pause of breaks) {
    invariant(isRecord(pause), "Pausa de agenda inválida");
    const pauseStart = minuteOf(pause.start);
    const pauseEnd = minuteOf(pause.end);
    invariant(
      pauseStart < pauseEnd && pauseStart >= open && pauseEnd <= close,
      "Pausa fuera del horario",
    );
  }
}

function validateBreaks(breaks: unknown) {
  invariant(Array.isArray(breaks), "Pausas de excepción inválidas");
  for (const pause of breaks) {
    invariant(isRecord(pause), "Pausa de excepción inválida");
    invariant(minuteOf(pause.start) < minuteOf(pause.end), "Intervalo de pausa inválido");
  }
}

function minuteOf(value: unknown): number {
  invariant(typeof value === "string" && /^\d{2}:\d{2}$/.test(value), "Hora de agenda inválida");
  const [hour, minute] = value.split(":").map(Number);
  invariant(hour! < 24 && minute! < 60, "Hora de agenda fuera de rango");
  return hour! * 60 + minute!;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function includes<const T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.includes(value);
}
