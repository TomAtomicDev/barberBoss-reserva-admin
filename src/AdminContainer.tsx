import { useState } from "react";
import AdminApp from "./admin-ui/AdminApp";
import type {
  AdminBooking,
  AdminBookingEvent,
  AdminCustomer,
  AdminData,
  AdminMoneyMovement,
  AdminScheduleDay,
  AdminVisit,
  BookingDraft,
  ServiceDraft,
  ScheduleDraft,
  VisitDraft,
  WalkInDraft,
} from "./admin-ui/types";
import {
  approveBooking,
  cancelBooking,
  completeVisit,
  createPhoneBooking,
  createWalkInVisit,
  expireProvisionalBookings,
  isBlockingBooking,
  markNoShow,
  recordInStorePayment,
  recordProductSale,
  refund,
  rejectBooking,
  releaseBooking,
  rescheduleBooking,
  updateBusinessConfig,
  upsertCustomer,
  transitionBooking,
  validateDomainState,
  zonedDateTimeToInstant,
} from "./domain";
import type { DomainState, PaymentMethod, ServiceVisitItem } from "./domain";
import { updateServiceCatalog } from "./admin-ui/service-catalog";

export interface AdminContainerProps {
  state: DomainState;
  commit: (next: DomainState) => void;
  restore: () => void;
}

const toCents = (amount: number) => Math.round(amount * 100);
const toBolivianos = (cents: number) => cents / 100;
const instant = () => new Date().toISOString();
const makeId = (prefix: string) =>
  `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const dateInZone = (value: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const localDateTimeToInstant = (value: string, timeZone: string) => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error("Indica una fecha y hora válida.");
  return new Date(zonedDateTimeToInstant(match[1], match[2], timeZone)).toISOString();
};
const methodFromLabel = (value?: string): PaymentMethod => {
  const normalized = value?.trim().toLocaleLowerCase("es");
  if (normalized === "efectivo" || normalized === "cash") return "CASH";
  if (
    normalized === "transferencia" ||
    normalized === "transferencia bancaria" ||
    normalized === "bank_transfer"
  )
    return "BANK_TRANSFER";
  return "OTHER";
};
const methodLabel = (method?: PaymentMethod) =>
  method === "CASH"
    ? "Efectivo"
    : method === "BANK_TRANSFER"
      ? "Transferencia"
      : method
        ? "Otro método"
        : undefined;
const paymentStatusLabel = (status: string) =>
  status === "DECLARED"
    ? "Pago declarado, sin verificar"
    : status === "VERIFIED"
      ? "Pago registrado en demo"
      : status === "REFUNDED"
        ? "Pago devuelto"
        : "Pago rechazado";
const serviceVisitItems = (draft: VisitDraft): ServiceVisitItem[] =>
  draft.items.map((item) => ({
    ...(item.serviceId ? { serviceId: item.serviceId } : {}),
    name: item.name,
    price: toBolivianos(item.priceCents),
    durationMinutes: item.durationMinutes,
  }));

function mapSchedule(state: DomainState): AdminScheduleDay[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const rule = state.business.schedule.find((item) => item.weekday === weekday);
    return {
      weekday,
      enabled: Boolean(rule),
      opensAt: rule?.start ?? "",
      closesAt: rule?.end ?? "",
      breakStartsAt: rule?.breaks?.[0]?.start,
      breakEndsAt: rule?.breaks?.[0]?.end,
    };
  });
}

function mapCustomers(state: DomainState): AdminCustomer[] {
  const customers = new Map<string, AdminCustomer>();
  for (const customer of state.customers ?? [])
    customers.set(customer.id, {
      id: customer.id,
      name: customer.name,
      phone: customer.phone || "Sin teléfono",
      email: customer.email,
      note: customer.preferences?.notes,
      musicLink: customer.preferences?.musicLink,
      bookingCount: 0,
    });
  for (const booking of state.bookings) {
    const current = customers.get(booking.customer.id);
    if (!current)
      customers.set(booking.customer.id, {
        id: booking.customer.id,
        name: booking.customer.name,
        phone: booking.customer.phone || "Sin teléfono",
        email: booking.customer.email,
        bookingCount: 0,
      });
  }
  for (const visit of state.visits) {
    const linkedBooking = visit.bookingId
      ? state.bookings.find((item) => item.id === visit.bookingId)
      : undefined;
    const customerId = visit.customerId ?? linkedBooking?.customer.id;
    if (!customerId) continue;
    const customer = customers.get(customerId);
    if (customer) {
      customer.bookingCount += 1;
      if (!customer.lastVisitAt || visit.completedAt > customer.lastVisitAt)
        customer.lastVisitAt = visit.completedAt;
    }
  }
  for (const event of state.bookingEvents) {
    const booking = state.bookings.find((item) => item.id === event.bookingId);
    const customer = booking && customers.get(booking.customer.id);
    if (customer) {
      const mappedEvent = {
        id: event.id,
        bookingId: event.bookingId,
        bookingCode: booking.code,
        action: event.action,
        actor: event.actor,
        occurredAt: event.occurredAt,
        reason: event.reason,
        changes: event.changes,
      } as AdminBookingEvent;
      (customer.events ??= []).push(mappedEvent);
    }
  }
  return [...customers.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function mapBookingEvents(state: DomainState, bookingId: string): AdminBookingEvent[] {
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return [];
  return state.bookingEvents
    .filter((item) => item.bookingId === bookingId)
    .map(
      (event) =>
        ({
          id: event.id,
          bookingId: event.bookingId,
          bookingCode: booking.code,
          action: event.action,
          actor: event.actor,
          occurredAt: event.occurredAt,
          reason: event.reason,
          changes: event.changes,
        }) as AdminBookingEvent,
    );
}

function mapMovements(state: DomainState): AdminMoneyMovement[] {
  return state.movements.map((movement) => {
    const payment = movement.paymentId
      ? state.payments.find((item) => item.id === movement.paymentId)
      : undefined;
    const sale =
      movement.kind === "SALE_IN"
        ? state.sales.find((item) => item.id === movement.id.replace(/^sale:/, ""))
        : undefined;
    const booking = payment?.bookingId
      ? state.bookings.find((item) => item.id === payment.bookingId)
      : undefined;
    const visitId =
      movement.visitId ??
      (payment
        ? state.movements.find(
            (item) => item.paymentId === payment.id && item.kind === "PAYMENT_IN",
          )?.visitId
        : undefined);
    const visit = visitId ? state.visits.find((item) => item.id === visitId) : undefined;
    const customer = visit?.customerId
      ? state.customers?.find((item) => item.id === visit.customerId)
      : undefined;
    const refunded = payment
      ? state.movements
          .filter((item) => item.paymentId === payment.id && item.kind === "REFUND_OUT")
          .reduce((sum, item) => sum + toCents(item.amount), 0)
      : 0;
    const kind: AdminMoneyMovement["kind"] =
      movement.kind === "REFUND_OUT" || movement.kind === "MANUAL_OUT"
        ? "refund"
        : movement.kind === "SALE_IN"
          ? "sale"
          : "payment";
    return {
      id: movement.id,
      createdAt: movement.occurredAt,
      kind,
      description:
        kind === "refund"
          ? (movement.description ?? "Devolución registrada")
          : (sale?.description ??
            (payment
              ? paymentStatusLabel(payment.status)
              : (movement.description ?? "Movimiento registrado"))),
      amountCents: toCents(movement.amount),
      customerName: booking?.customer.name ?? customer?.name,
      method: methodLabel(payment?.method ?? sale?.method),
      canRefund: Boolean(payment?.status === "VERIFIED" && movement.kind === "PAYMENT_IN"),
      refundableCents: payment ? Math.max(0, toCents(payment.amount) - refunded) : undefined,
    };
  });
}

export function mapData(state: DomainState): AdminData {
  const timezone = state.business.timeZone;
  const today = dateInZone(instant(), timezone);
  const activeStatuses = new Set(["AWAITING_PAYMENT_NOTICE", "PENDING_VERIFICATION", "CONFIRMED"]);
  const movements = mapMovements(state);
  return {
    businessName: state.business.name,
    barberName: state.business.barber.name,
    timezone,
    summary: {
      bookingsToday: state.bookings.filter(
        (item) => activeStatuses.has(item.status) && dateInZone(item.startsAt, timezone) === today,
      ).length,
      pendingRequests: state.bookings.filter(
        (item) =>
          item.status === "AWAITING_PAYMENT_NOTICE" || item.status === "PENDING_VERIFICATION",
      ).length,
      visitsToday: state.visits.filter((item) => dateInZone(item.completedAt, timezone) === today)
        .length,
      collectedCents: state.movements
        .filter(
          (item) =>
            item.kind === "PAYMENT_IN" || item.kind === "SALE_IN" || item.kind === "MANUAL_IN",
        )
        .reduce((sum, item) => sum + toCents(item.amount), 0),
      refundedCents: state.movements
        .filter((item) => item.kind === "REFUND_OUT" || item.kind === "MANUAL_OUT")
        .reduce((sum, item) => sum + toCents(item.amount), 0),
    },
    bookings: [
      ...state.bookings.map((booking): AdminBooking => {
        const payments = state.payments.filter((item) => item.bookingId === booking.id);
        return {
          id: booking.id,
          code: booking.code,
          customerId: booking.customer.id,
          customerName: booking.customer.name,
          customerPhone: booking.customer.phone,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          status: booking.status,
          source:
            booking.source === "WEB"
              ? "web-demo"
              : booking.source === "PHONE"
                ? "phone"
                : "walk-in",
          items: booking.items.map((item) => ({
            serviceId: item.serviceId,
            name: item.name,
            priceCents: toCents(item.price),
            durationMinutes: item.durationMinutes,
          })),
          totalCents: toCents(booking.totalPrice),
          note: booking.customer.preferences?.notes,
          musicLink: booking.customer.preferences?.musicLink,
          paymentLabel: payments.length
            ? payments.map((payment) => paymentStatusLabel(payment.status)).join(" · ")
            : undefined,
          canApprove: payments.some((payment) => payment.status === "DECLARED"),
          events: mapBookingEvents(state, booking.id),
        };
      }),
      ...state.visits
        .filter(
          (visit) =>
            !visit.bookingId &&
            visit.startsAt &&
            visit.endsAt &&
            visit.blocksAvailability !== false,
        )
        .map((visit): AdminBooking => {
          const linkedBooking = visit.bookingId
            ? state.bookings.find((item) => item.id === visit.bookingId)
            : undefined;
          const customer =
            (state.customers ?? []).find((item) => item.id === visit.customerId) ??
            linkedBooking?.customer;
          return {
            id: `visit:${visit.id}`,
            code: `VIS-${visit.id.slice(-6)}`,
            customerId: visit.customerId,
            customerName: customer?.name ?? "Walk-in",
            customerPhone: customer?.phone || "Sin teléfono",
            startsAt: visit.startsAt!,
            endsAt: visit.endsAt!,
            status: "COMPLETED",
            source: "walk-in",
            items: visit.items.map((item) => ({
              serviceId: item.serviceId,
              name: item.name,
              priceCents: toCents(item.price),
              durationMinutes: item.durationMinutes,
            })),
            totalCents: toCents(visit.totalPrice),
            note: customer?.preferences?.notes,
            musicLink: customer?.preferences?.musicLink,
            isVisit: true,
          };
        }),
    ],
    customers: mapCustomers(state),
    services: state.services.map((service) => ({ ...service, priceCents: toCents(service.price) })),
    movements,
    visits: state.visits.map((visit): AdminVisit => {
      const customer = (state.customers ?? []).find((item) => item.id === visit.customerId);
      const booking = visit.bookingId
        ? state.bookings.find((item) => item.id === visit.bookingId)
        : undefined;
      return {
        id: visit.id,
        completedAt: visit.completedAt,
        customerName: customer?.name ?? booking?.customer.name ?? "Walk-in",
        items: visit.items.map((item) => ({
          name: item.name,
          priceCents: toCents(item.price),
          durationMinutes: item.durationMinutes,
        })),
        totalCents: toCents(visit.totalPrice),
      };
    }),
    schedule: mapSchedule(state),
    exceptions: state.business.exceptions.map((exception) => ({
      id: `exception:${exception.date}`,
      date: exception.date,
      label: exception.closed ? "Cierre especial" : "Horario especial",
      closed: Boolean(exception.closed),
      opensAt: exception.start,
      closesAt: exception.end,
    })),
  };
}

type IdFactory = (prefix: string) => string;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function resolveDraftCustomer(
  state: DomainState,
  input: { name: string; phone: string; note?: string },
  makeCustomerId: IdFactory,
) {
  const normalizedPhone = normalizePhone(input.phone);
  const exactName = input.name.trim();
  const knownById = new Map((state.customers ?? []).map((customer) => [customer.id, customer]));
  for (const booking of state.bookings)
    if (!knownById.has(booking.customer.id)) knownById.set(booking.customer.id, booking.customer);
  const knownCustomers = [...knownById.values()];
  const phoneMatches = normalizedPhone
    ? knownCustomers.filter((customer) => normalizePhone(customer.phone) === normalizedPhone)
    : [];
  const nameMatches = knownCustomers.filter((customer) => customer.name.trim() === exactName);
  const matches = phoneMatches.filter((customer) => customer.name.trim() === exactName);
  if (matches.length === 1 && phoneMatches.length === 1 && nameMatches.length === 1) {
    const existing = matches[0]!;
    return {
      ...existing,
      name: input.name.trim() || existing.name,
      phone: existing.phone,
      preferences: {
        ...existing.preferences,
        ...(input.note ? { notes: input.note } : {}),
      },
    };
  }
  return {
    id: makeCustomerId("customer"),
    name: input.name.trim(),
    phone: input.phone.trim(),
    ...(input.note ? { preferences: { notes: input.note } } : {}),
  };
}

export function createPhoneBookingFromDraft(
  state: DomainState,
  draft: BookingDraft,
  makeId: IdFactory = (prefix) => globalThis.crypto?.randomUUID?.() ?? `${prefix}:${Date.now()}`,
  now = instant(),
): DomainState {
  const startsAt = localDateTimeToInstant(draft.startsAt, state.business.timeZone);
  const agreedServices = state.services
    .filter((service) => draft.serviceIds.includes(service.id) && service.requiresConsultation)
    .map((service) => {
      if (draft.agreedPriceCents === undefined || draft.agreedDurationMinutes === undefined)
        throw new Error(`Indica precio y duración acordados para “${service.name}”.`);
      return {
        serviceId: service.id,
        price: toBolivianos(draft.agreedPriceCents),
        durationMinutes: draft.agreedDurationMinutes,
      };
    });
  const customer = resolveDraftCustomer(
    state,
    { name: draft.customerName, phone: draft.customerPhone, note: draft.note },
    makeId,
  );
  return createPhoneBooking(state, {
    id: makeId("booking"),
    code: `TEL-${Date.now().toString(36).toUpperCase()}`,
    customer,
    barberId: state.business.barber.id,
    source: "PHONE",
    startsAt,
    serviceIds: draft.serviceIds,
    agreedServices: agreedServices.length ? agreedServices : undefined,
    now,
  });
}

export function createWalkInFromDraft(
  state: DomainState,
  draft: WalkInDraft,
  makeId: IdFactory = (prefix) => globalThis.crypto?.randomUUID?.() ?? `${prefix}:${Date.now()}`,
  now = instant(),
): DomainState {
  const items = draft.serviceIds.map((serviceId) => {
    const service = state.services.find((item) => item.id === serviceId && item.active);
    if (!service) throw new Error("Selecciona servicios activos para la atención.");
    if (service.requiresConsultation)
      throw new Error(
        `“${service.name}” requiere consulta previa y no puede registrarse directamente.`,
      );
    return {
      serviceId: service.id,
      name: service.name,
      price: service.price,
      durationMinutes: service.durationMinutes,
    };
  });
  const startsAt = now;
  const barberId = state.business.barber.id;
  const endsAt = new Date(
    Date.parse(startsAt) + items.reduce((sum, item) => sum + item.durationMinutes, 0) * 60_000,
  ).toISOString();
  const bookingConflict = expireProvisionalBookings(state.bookings, startsAt).find(
    (booking) =>
      booking.barberId === barberId &&
      isBlockingBooking(booking.status) &&
      overlaps(startsAt, endsAt, booking.startsAt, booking.endsAt),
  );
  if (bookingConflict)
    throw new Error(
      `No se puede registrar el walk-in: el intervalo inmediato se solapa con la reserva ${bookingConflict.code}.`,
    );
  const visitConflict = state.visits.find(
    (visit) =>
      visit.blocksAvailability !== false &&
      (!visit.barberId || visit.barberId === barberId) &&
      visit.startsAt &&
      visit.endsAt &&
      overlaps(startsAt, endsAt, visit.startsAt, visit.endsAt),
  );
  if (visitConflict)
    throw new Error(
      `No se puede registrar el walk-in: el intervalo inmediato se solapa con otra atención (${visitConflict.id}).`,
    );

  const customer = resolveDraftCustomer(
    state,
    { name: draft.customerName, phone: draft.customerPhone, note: draft.note },
    makeId,
  );
  const withCustomer = upsertCustomer(state, customer);
  const visit = {
    id: makeId("visit"),
    barberId,
    customerId: customer.id,
    startsAt,
    endsAt,
    blocksAvailability: true,
    completedAt: startsAt,
    items,
    totalPrice: items.reduce((sum, item) => sum + item.price, 0),
  };
  let next = createWalkInVisit(withCustomer, visit);
  if (draft.paymentCents && draft.paymentCents > 0) {
    const paymentId = makeId("payment");
    next = recordInStorePayment(next, {
      id: paymentId,
      amount: toBolivianos(draft.paymentCents),
      method: methodFromLabel(draft.paymentMethod),
      now: startsAt,
    });
    next = {
      ...next,
      movements: next.movements.map((movement) =>
        movement.paymentId === paymentId
          ? {
              ...movement,
              visitId: visit.id,
              description: `Pago walk-in de ${customer.name} · atención ${visit.id}`,
            }
          : movement,
      ),
    };
  }
  return next;
}

export function completeVisitFromDraft(
  state: DomainState,
  draft: VisitDraft,
  makeId: IdFactory = (prefix) => globalThis.crypto?.randomUUID?.() ?? `${prefix}:${Date.now()}`,
  now = instant(),
): DomainState {
  const booking = draft.bookingId
    ? state.bookings.find((item) => item.id === draft.bookingId)
    : undefined;
  if (draft.bookingId && !booking)
    throw new Error("No se puede registrar la atención: la reserva vinculada no existe.");
  if (booking && booking.status !== "CONFIRMED")
    throw new Error("Solo se puede completar una reserva en estado CONFIRMED.");

  const visitCustomer = booking
    ? ((state.customers ?? []).find((item) => item.id === booking.customer.id) ?? booking.customer)
    : draft.customerId
      ? (state.customers ?? []).find((item) => item.id === draft.customerId)
      : undefined;
  let initialState = state;
  if (visitCustomer) initialState = upsertCustomer(state, visitCustomer);
  const items = serviceVisitItems(draft);
  const visitId = makeId("visit");
  const startsAt = booking?.startsAt ?? now;
  const endsAt = new Date(
    Date.parse(startsAt) + items.reduce((sum, item) => sum + item.durationMinutes, 0) * 60_000,
  ).toISOString();
  let next = completeVisit(initialState, {
    id: visitId,
    barberId: booking?.barberId ?? state.business.barber.id,
    ...(draft.bookingId ? { bookingId: draft.bookingId } : {}),
    ...(visitCustomer ? { customerId: visitCustomer.id } : {}),
    startsAt,
    endsAt,
    blocksAvailability: true,
    completedAt: now,
    items,
    totalPrice: items.reduce((sum, item) => sum + item.price, 0),
  });
  if (booking) {
    next = { ...next, bookings: transitionBooking(next.bookings, booking.id, "COMPLETED") };
    next = {
      ...next,
      bookingEvents: [
        ...next.bookingEvents,
        {
          id: makeId("event"),
          bookingId: booking.id,
          action: "COMPLETED",
          actor: "OWNER",
          occurredAt: now,
        },
      ],
    };
  }
  if (draft.paymentCents && draft.paymentCents > 0)
    next = recordInStorePayment(next, {
      id: makeId("payment"),
      bookingId: draft.bookingId,
      amount: toBolivianos(draft.paymentCents),
      method: methodFromLabel(draft.paymentMethod),
      now,
    });
  return next;
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return Date.parse(startA) < Date.parse(endB) && Date.parse(endA) > Date.parse(startB);
}

export default function AdminContainer({ state, commit, restore }: AdminContainerProps) {
  const [demoAccessGranted, setDemoAccessGranted] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );

  const perform = (successMessage: string, operation: () => DomainState) => {
    try {
      const next = operation();
      if (!validateDomainState(next))
        throw new Error("Los datos resultantes no pasaron la validación.");
      commit(next);
      setFeedback({ kind: "success", message: successMessage });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo aplicar el cambio.",
      });
    }
  };

  const data = mapData(state);
  return (
    <AdminApp
      data={data}
      demoAccessGranted={demoAccessGranted}
      feedback={feedback}
      onEnterDemo={() => setDemoAccessGranted(true)}
      onApproveRequest={(bookingId) =>
        perform("Solicitud aprobada en el estado local del demo.", () => {
          const payment = state.payments.find(
            (item) => item.bookingId === bookingId && item.status === "DECLARED",
          );
          if (!payment)
            throw new Error(
              "No hay un pago declarado para aprobar. Revisa la solicitud antes de continuar.",
            );
          return approveBooking(state, bookingId, payment.id, instant());
        })
      }
      onRejectRequest={(bookingId, reason) =>
        perform("Solicitud rechazada en el estado local del demo.", () =>
          rejectBooking(state, bookingId, instant(), reason),
        )
      }
      onReleaseRequest={(bookingId, reason) =>
        perform("Horario liberado en el estado local del demo.", () =>
          releaseBooking(state, bookingId, instant(), reason),
        )
      }
      onCreatePhoneBooking={(draft) =>
        perform("Reserva telefónica añadida al estado del demo.", () =>
          createPhoneBookingFromDraft(state, draft, makeId, instant()),
        )
      }
      onRescheduleBooking={(draft) =>
        perform("Cita reprogramada en el estado local del demo.", () =>
          rescheduleBooking(
            state,
            draft.bookingId,
            localDateTimeToInstant(draft.startsAt, state.business.timeZone),
            instant(),
            draft.reason,
          ),
        )
      }
      onCancelBooking={(bookingId, reason) =>
        perform("Cita cancelada en el estado local del demo.", () =>
          cancelBooking(state, bookingId, instant(), reason),
        )
      }
      onMarkNoShow={(bookingId) =>
        perform("La cita quedó marcada como inasistencia en el demo.", () =>
          markNoShow(state, bookingId, instant()),
        )
      }
      onCreateWalkIn={(draft) =>
        perform("Atención walk-in añadida al estado local del demo.", () =>
          createWalkInFromDraft(state, draft, makeId, instant()),
        )
      }
      onCompleteVisit={(draft) =>
        perform("Atención registrada en el estado local del demo.", () =>
          completeVisitFromDraft(state, draft, makeId, instant()),
        )
      }
      onRecordSale={(draft) =>
        perform("Venta registrada en el estado local del demo.", () =>
          recordProductSale(state, {
            id: makeId("sale"),
            description: draft.description,
            quantity: draft.quantity,
            amount: toBolivianos(draft.amountCents),
            ...(draft.paymentMethod?.trim()
              ? { method: methodFromLabel(draft.paymentMethod) }
              : {}),
            occurredAt: instant(),
          }),
        )
      }
      onRecordRefund={(draft) =>
        perform("Devolución registrada en el estado local del demo.", () => {
          const movementId = makeId("refund");
          const original = state.movements.find(
            (item) => item.id === draft.movementId && item.kind === "PAYMENT_IN",
          );
          if (!original?.paymentId)
            throw new Error("Selecciona un pago registrado para la devolución.");
          const next = refund(
            state,
            original.paymentId,
            toBolivianos(draft.amountCents),
            instant(),
            movementId,
          );
          return {
            ...next,
            movements: next.movements.map((item) =>
              item.id === movementId ? { ...item, description: draft.reason } : item,
            ),
          };
        })
      }
      onSaveService={(draft: ServiceDraft) =>
        perform(
          draft.id
            ? "Servicio actualizado en el catálogo del demo."
            : "Servicio añadido al catálogo del demo.",
          () => updateServiceCatalog(state, draft, () => makeId("service")),
        )
      }
      onSaveSchedule={(draft: ScheduleDraft) =>
        perform("Horario actualizado en el estado local del demo.", () => {
          const schedule = draft.schedule.flatMap((day) => {
            if (!day.enabled) return [];
            const existing = state.business.schedule.find((rule) => rule.weekday === day.weekday);
            const breaks = [...(existing?.breaks?.slice(1) ?? [])];
            if (day.breakStartsAt && day.breakEndsAt)
              breaks.unshift({ start: day.breakStartsAt, end: day.breakEndsAt });
            return [
              {
                weekday: day.weekday,
                start: day.opensAt,
                end: day.closesAt,
                ...(breaks.length ? { breaks } : {}),
              },
            ];
          });
          const exceptions = draft.exceptions.map((exception) => {
            const existing = state.business.exceptions.find((item) => item.date === exception.date);
            return {
              date: exception.date,
              ...(exception.closed ? { closed: true } : {}),
              ...(!exception.closed && exception.opensAt && exception.closesAt
                ? { start: exception.opensAt, end: exception.closesAt }
                : {}),
              ...(existing?.breaks ? { breaks: existing.breaks } : {}),
            };
          });
          if (new Set(exceptions.map((exception) => exception.date)).size !== exceptions.length)
            throw new Error("No puede haber más de una excepción para la misma fecha.");
          return updateBusinessConfig(state, { ...state.business, schedule, exceptions });
        })
      }
      onRestoreDemoData={() => {
        try {
          restore();
          setFeedback({
            kind: "success",
            message: "Se solicitó restaurar los datos iniciales del demo.",
          });
        } catch (error) {
          setFeedback({
            kind: "error",
            message: error instanceof Error ? error.message : "No se pudieron restaurar los datos.",
          });
        }
      }}
    />
  );
}
