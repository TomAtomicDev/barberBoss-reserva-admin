import { describe, expect, it } from "vite-plus/test";
import {
  completeVisitFromDraft,
  createPhoneBookingFromDraft,
  createWalkInFromDraft,
  mapData,
} from "./AdminContainer";
import type { DomainState } from "./domain";
import type { BookingDraft, VisitDraft, WalkInDraft } from "./admin-ui/types";

const NOW = "2026-11-03T12:00:00.000Z";

function makeState(): DomainState {
  return {
    customers: [],
    services: [
      {
        id: "cut",
        name: "Corte",
        price: 40,
        durationMinutes: 60,
        active: true,
        requiresConsultation: false,
      },
      {
        id: "beard",
        name: "Barba",
        price: 20,
        durationMinutes: 45,
        active: true,
        requiresConsultation: false,
      },
    ],
    bookings: [],
    payments: [],
    visits: [],
    movements: [],
    bookingEvents: [],
    sales: [],
    business: {
      name: "Boss Barber Shop by RF",
      barber: { id: "roly", name: "Roly" },
      timeZone: "America/La_Paz",
      schedule: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        start: "07:00",
        end: "20:00",
      })),
      exceptions: [],
    },
  };
}

function idFactory() {
  let index = 0;
  return (prefix: string) => `${prefix}-${++index}`;
}

describe("AdminContainer operation mapping", () => {
  it("records a completed booking visit for the actual item duration and retains the deposit once", () => {
    const state = makeState();
    const booking = {
      id: "booking-1",
      code: "B-1",
      customer: { id: "customer-1", name: "Ana Demo", phone: "70000000" },
      barberId: "roly",
      source: "WEB" as const,
      startsAt: "2026-11-03T14:00:00.000Z",
      endsAt: "2026-11-03T15:00:00.000Z",
      status: "CONFIRMED" as const,
      items: [{ serviceId: "cut", name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
      createdAt: NOW,
    };
    state.bookings.push(booking);
    state.customers!.push(booking.customer);
    state.payments.push({
      id: "deposit",
      bookingId: booking.id,
      amount: 10,
      method: "BANK_TRANSFER",
      status: "VERIFIED",
      createdAt: NOW,
    });
    state.movements.push({
      id: "payment:deposit",
      kind: "PAYMENT_IN",
      paymentId: "deposit",
      amount: 10,
      occurredAt: NOW,
    });
    const draft: VisitDraft = {
      bookingId: booking.id,
      customerId: booking.customer.id,
      customerName: booking.customer.name,
      items: [
        { serviceId: "cut", name: "Corte", priceCents: 4000, durationMinutes: 60 },
        { serviceId: "beard", name: "Barba adicional", priceCents: 2000, durationMinutes: 45 },
      ],
    };

    const next = completeVisitFromDraft(state, draft, idFactory(), NOW);
    expect(next.visits[0]).toMatchObject({
      startsAt: booking.startsAt,
      endsAt: "2026-11-03T15:45:00.000Z",
      blocksAvailability: true,
      bookingId: booking.id,
    });
    expect(next.bookings[0]?.status).toBe("COMPLETED");
    expect(next.movements).toHaveLength(1);
    expect(next.movements[0]?.amount).toBe(10);
  });

  it("rejects completion for a missing or non-confirmed reservation", () => {
    const state = makeState();
    const draft: VisitDraft = {
      bookingId: "missing",
      customerId: "c",
      customerName: "Demo",
      items: [],
    };
    expect(() => completeVisitFromDraft(state, draft, idFactory(), NOW)).toThrow(/no existe/);
    state.bookings.push({
      id: "pending",
      code: "P",
      customer: { id: "c", name: "Demo", phone: "70000000" },
      barberId: "roly",
      source: "WEB",
      startsAt: NOW,
      endsAt: "2026-11-03T13:00:00.000Z",
      status: "PENDING_VERIFICATION",
      items: [{ serviceId: "cut", name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
      createdAt: NOW,
    });
    expect(() =>
      completeVisitFromDraft(state, { ...draft, bookingId: "pending" }, idFactory(), NOW),
    ).toThrow(/CONFIRMED/);
  });

  it("blocks a walk-in that overlaps a live booking and ignores an expired provisional booking", () => {
    const state = makeState();
    state.bookings.push({
      id: "live",
      code: "LIVE-42",
      customer: { id: "c1", name: "Otra persona", phone: "70000001" },
      barberId: "roly",
      source: "WEB",
      startsAt: "2026-11-03T12:30:00.000Z",
      endsAt: "2026-11-03T13:30:00.000Z",
      status: "AWAITING_PAYMENT_NOTICE",
      expiresAt: "2026-11-03T12:10:00.000Z",
      items: [{ serviceId: "cut", name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
      createdAt: NOW,
    });
    const draft: WalkInDraft = {
      customerName: "Walk-in",
      customerPhone: "70000002",
      serviceIds: ["cut"],
    };
    expect(() => createWalkInFromDraft(state, draft, idFactory(), NOW)).toThrow(/LIVE-42/);
    state.bookings[0]!.expiresAt = "2026-11-03T11:59:00.000Z";
    const next = createWalkInFromDraft(state, draft, idFactory(), NOW);
    expect(next.bookings[0]?.status).toBe("AWAITING_PAYMENT_NOTICE");
    expect(next.visits).toHaveLength(1);
  });

  it("blocks a walk-in that overlaps another availability-blocking visit", () => {
    const state = makeState();
    state.visits.push({
      id: "existing-visit",
      startsAt: NOW,
      endsAt: "2026-11-03T13:00:00.000Z",
      blocksAvailability: true,
      completedAt: "2026-11-03T13:00:00.000Z",
      items: [{ name: "Atención", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
    });
    expect(() =>
      createWalkInFromDraft(
        state,
        { customerName: "Walk-in", customerPhone: "70000002", serviceIds: ["cut"] },
        idFactory(),
        NOW,
      ),
    ).toThrow(/otra atención \(existing-visit\)/);
  });

  it("links walk-in payment movement to its visit without changing its generated movement id", () => {
    const draft: WalkInDraft = {
      customerName: "Ana Demo",
      customerPhone: "70000000",
      serviceIds: ["cut"],
      paymentCents: 1500,
      paymentMethod: "Efectivo",
    };
    const next = createWalkInFromDraft(makeState(), draft, idFactory(), NOW);
    expect(next.payments).toHaveLength(1);
    expect(next.payments[0]?.bookingId).toBeUndefined();
    expect(next.movements[0]).toMatchObject({
      id: "payment:payment-3",
      paymentId: "payment-3",
      visitId: "visit-2",
      description: "Pago walk-in de Ana Demo · atención visit-2",
    });
  });

  it("reuses a customer only on a unique exact name-and-phone match; otherwise creates a separate profile", () => {
    const state = makeState();
    state.customers!.push({
      id: "known",
      name: "Ana Demo",
      phone: "+591 7000-0000",
      email: "ana@example.test",
      preferences: { notes: "Mantener", musicLink: "https://open.spotify.com/" },
    });
    const draft: WalkInDraft = {
      customerName: "Ana Demo",
      customerPhone: "+591 7000-0000",
      serviceIds: ["cut"],
    };
    const reused = createWalkInFromDraft(state, draft, idFactory(), NOW);
    expect(reused.customers).toHaveLength(1);
    expect(reused.visits[0]?.customerId).toBe("known");
    expect(reused.customers?.[0]?.preferences).toEqual(state.customers?.[0]?.preferences);

    state.customers!.push({ id: "other", name: "Otra Ana", phone: "+591 7000-0000" });
    const ambiguous = createWalkInFromDraft(state, draft, idFactory(), NOW);
    expect(ambiguous.visits[0]?.customerId).not.toBe("known");
    expect(ambiguous.customers).toHaveLength(3);
  });

  it("preserves a uniquely matched customer profile when creating a phone booking", () => {
    const state = makeState();
    state.customers!.push({
      id: "known-phone",
      name: "Ana Demo",
      phone: "70000000",
      email: "ana@example.test",
      preferences: { notes: "Nota previa", musicLink: "https://open.spotify.com/" },
    });
    const draft: BookingDraft = {
      customerName: "Ana Demo",
      customerPhone: "70000000",
      startsAt: "2026-11-03T10:00",
      serviceIds: ["cut"],
    };
    const next = createPhoneBookingFromDraft(state, draft, idFactory(), NOW);
    expect(next.bookings[0]?.customer.id).toBe("known-phone");
    expect(next.customers).toHaveLength(1);
    expect(next.customers?.[0]?.preferences).toEqual(state.customers?.[0]?.preferences);
  });

  it("maps all booking payment statuses, approves if any payment is declared, counts visits, and forwards event changes", () => {
    const state = makeState();
    const customer = { id: "c", name: "Ana", phone: "70000000" };
    state.customers!.push(customer);
    state.bookings.push({
      id: "b",
      code: "B",
      customer,
      barberId: "roly",
      source: "WEB",
      startsAt: NOW,
      endsAt: "2026-11-03T13:00:00.000Z",
      status: "PENDING_VERIFICATION",
      items: [{ serviceId: "cut", name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
      createdAt: NOW,
    });
    state.payments.push(
      {
        id: "p-verified",
        bookingId: "b",
        amount: 5,
        method: "CASH",
        status: "VERIFIED",
        createdAt: NOW,
      },
      {
        id: "p-declared",
        bookingId: "b",
        amount: 5,
        method: "CASH",
        status: "DECLARED",
        createdAt: NOW,
      },
    );
    state.bookingEvents.push({
      id: "event-1",
      bookingId: "b",
      action: "RESCHEDULED",
      actor: "OWNER",
      occurredAt: NOW,
      changes: { from: "old", to: "new" },
    });
    state.visits.push({
      id: "v",
      bookingId: "b",
      customerId: "c",
      completedAt: NOW,
      items: [{ name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
    });

    const data = mapData(state);
    expect(data.bookings[0]?.canApprove).toBe(true);
    expect(data.bookings[0]?.paymentLabel).toContain("Pago registrado en demo");
    expect(data.bookings[0]?.paymentLabel).toContain("Pago declarado, sin verificar");
    expect(data.bookings[0]?.events?.[0]).toHaveProperty("changes", { from: "old", to: "new" });
    expect((data.customers[0]?.events?.[0] as unknown as { changes?: unknown })?.changes).toEqual({
      from: "old",
      to: "new",
    });
    expect(data.customers[0]?.bookingCount).toBe(1);
  });
});
