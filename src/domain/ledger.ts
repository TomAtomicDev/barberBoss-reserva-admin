import { DomainError, invariant } from "./errors";
import { validInstant } from "./time";
import { hasCentavoPrecision } from "./money";
import type { DomainState, MoneyMovement, Payment, ServiceVisit } from "./types";

export function verifyPayment(state: DomainState, paymentId: string, now: string): DomainState {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) throw new DomainError("NOT_FOUND", "Pago no encontrado");
  if (payment.status !== "DECLARED")
    throw new DomainError("INVALID_TRANSITION", "Solo se puede verificar un pago declarado");
  invariant(hasCentavoPrecision(payment.amount) && payment.amount > 0, "Importe de pago inválido");
  const updatedPayment = { ...payment, status: "VERIFIED" as const };
  return {
    ...state,
    payments: state.payments.map((item) => (item.id === paymentId ? updatedPayment : item)),
    movements: addMovementOnce(state.movements, {
      id: `payment:${paymentId}`,
      kind: "PAYMENT_IN",
      amount: payment.amount,
      occurredAt: new Date(validInstant(now)).toISOString(),
      paymentId,
    }),
  };
}

export function refundPayment(
  state: DomainState,
  paymentId: string,
  amount: number,
  now: string,
  movementId: string,
): DomainState {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) throw new DomainError("NOT_FOUND", "Pago no encontrado");
  invariant(payment.status === "VERIFIED", "Solo se puede devolver un pago verificado");
  invariant(hasCentavoPrecision(payment.amount) && payment.amount > 0, "Importe del pago inválido");
  const refundedCents = state.movements
    .filter((movement) => movement.kind === "REFUND_OUT" && movement.paymentId === paymentId)
    .reduce((sum, movement) => sum + Math.round(movement.amount * 100), 0);
  const paymentCents = Math.round(payment.amount * 100);
  const amountCents = Math.round(amount * 100);
  invariant(
    hasCentavoPrecision(amount) &&
      Math.abs(amount * 100 - amountCents) < 0.000001 &&
      amountCents > 0 &&
      refundedCents + amountCents <= paymentCents,
    "Importe de devolución inválido",
  );
  return {
    ...state,
    payments: state.payments.map((item) =>
      item.id === paymentId && refundedCents + amountCents === paymentCents
        ? { ...item, status: "REFUNDED" as const }
        : item,
    ),
    movements: addMovementOnce(state.movements, {
      id: movementId,
      kind: "REFUND_OUT",
      amount,
      occurredAt: new Date(validInstant(now)).toISOString(),
      paymentId,
    }),
  };
}

export function completeVisit(state: DomainState, visit: ServiceVisit): DomainState {
  invariant(!state.visits.some((item) => item.id === visit.id), "La atención ya existe");
  invariant(
    !visit.bookingId || !state.visits.some((item) => item.bookingId === visit.bookingId),
    "La reserva ya tiene una atención registrada",
  );
  invariant(
    visit.items.length > 0 &&
      visit.items.every(
        (item) => hasCentavoPrecision(item.price) && item.price >= 0 && item.durationMinutes > 0,
      ),
    "Servicios realizados inválidos",
  );
  const totalPrice = visit.items.reduce((sum, item) => sum + item.price, 0);
  const savedVisit = {
    ...visit,
    completedAt: new Date(validInstant(visit.completedAt)).toISOString(),
    totalPrice,
  };
  // A visit is operational/service revenue, not a cash movement: payments remain the only recorded receipts.
  return { ...state, visits: [...state.visits, savedVisit] };
}

export function addMovementOnce(
  movements: MoneyMovement[],
  movement: MoneyMovement,
): MoneyMovement[] {
  if (
    movements.some(
      (item) =>
        item.id === movement.id ||
        (movement.kind === "PAYMENT_IN" &&
          movement.paymentId &&
          item.paymentId === movement.paymentId &&
          item.kind === movement.kind),
    )
  ) {
    throw new DomainError("DUPLICATE_MOVEMENT", "El movimiento ya fue registrado");
  }
  invariant(
    hasCentavoPrecision(movement.amount) && movement.amount > 0,
    "El movimiento debe tener importe positivo",
  );
  return [...movements, movement];
}

export function bookingWithPaymentStatus(
  bookings: DomainState["bookings"],
  payments: Payment[],
  bookingId: string,
) {
  return {
    booking: bookings.find((booking) => booking.id === bookingId),
    payments: payments.filter((payment) => payment.bookingId === bookingId),
  };
}
