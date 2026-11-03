import { describe, expect, it } from "vite-plus/test";
import {
  addVisitItem,
  createDemoSeed,
  createPhoneBooking,
  createWalkInVisit,
  markNoShow,
  recordInStorePayment,
  recordProductSale,
  refund,
  rescheduleBooking,
  upsertCustomer,
  validateDomainState,
} from "./index";
import type { DomainState } from "./index";

const base = (): DomainState => ({
  ...createDemoSeed("2026-11-03T12:00:00.000Z"),
  services: [
    {
      id: "cut",
      name: "Corte",
      price: 40,
      durationMinutes: 60,
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
});

describe("administrative domain operations", () => {
  it("creates and re-schedules phone bookings with auditable history", () => {
    const state = base();
    const input = {
      id: "phone-1",
      code: "TEL1",
      customer: { id: "c1", name: "Demo", phone: "000" },
      barberId: "barber",
      source: "PHONE" as const,
      startsAt: "2026-11-03T14:00:00.000Z",
      serviceIds: ["cut"],
      now: "2026-11-03T12:00:00.000Z",
    };
    const created = createPhoneBooking(state, input);
    expect(created.bookings[0]?.status).toBe("CONFIRMED");
    const withWalkInInterval = {
      ...created,
      visits: [
        {
          id: "visit-block",
          startsAt: "2026-11-03T15:00:00.000Z",
          endsAt: "2026-11-03T16:00:00.000Z",
          blocksAvailability: true,
          completedAt: "2026-11-03T16:00:00.000Z",
          items: [{ name: "Atención", price: 20, durationMinutes: 60 }],
          totalPrice: 20,
        },
      ],
    };
    expect(() =>
      rescheduleBooking(withWalkInInterval, "phone-1", "2026-11-03T15:00:00.000Z", input.now),
    ).toThrow(/no está disponible/);
    const moved = rescheduleBooking(
      withWalkInInterval,
      "phone-1",
      "2026-11-03T18:00:00.000Z",
      input.now,
      "Cambio solicitado",
    );
    expect(moved.bookings[0]?.startsAt).toBe("2026-11-03T18:00:00.000Z");
    expect(moved.bookingEvents.map((entry) => entry.action)).toEqual([
      "CREATED_BY_PHONE",
      "RESCHEDULED",
    ]);
    expect(markNoShow(moved, "phone-1", input.now).bookings[0]?.status).toBe("NO_SHOW");
  });

  it("records walk-in visits, additions, payments, sales and independent refunds", () => {
    const customer = { id: "walk-in-customer", name: "Cliente Walk-in", phone: "000000003" };
    const state = upsertCustomer(base(), customer);
    const visit = createWalkInVisit(state, {
      id: "visit-1",
      customerId: customer.id,
      completedAt: "2026-11-03T14:00:00.000Z",
      items: [{ name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
    });
    const withExtra = addVisitItem(visit, "visit-1", {
      name: "Producto adicional",
      price: 5,
      durationMinutes: 5,
    });
    expect(withExtra.visits[0]?.totalPrice).toBe(45);
    expect(withExtra.movements).toHaveLength(0);
    const paid = recordInStorePayment(withExtra, {
      id: "p1",
      amount: 20,
      method: "CASH",
      now: "2026-11-03T14:05:00.000Z",
    });
    const sold = recordProductSale(paid, {
      id: "s1",
      description: "Pomada",
      quantity: 1,
      amount: 10,
      method: "CASH",
      occurredAt: "2026-11-03T14:06:00.000Z",
    });
    const returned = refund(sold, "p1", 5, "2026-11-03T14:07:00.000Z", "refund-1");
    expect(returned.movements.map((movement) => movement.kind)).toEqual([
      "PAYMENT_IN",
      "SALE_IN",
      "REFUND_OUT",
    ]);
    expect(returned.visits).toHaveLength(1);
    expect(returned.sales[0]?.method).toBe("CASH");
    expect(
      returned.customers?.some((item) => item.id === customer.id && item.name === customer.name),
    ).toBe(true);
    expect(() =>
      refund(sold, "p1", 0.001, "2026-11-03T14:07:00.000Z", "refund-fractional"),
    ).toThrow();
  });

  it("provides a valid fictional seed including consultation-only service", () => {
    const seed = createDemoSeed("2026-11-03T12:00:00.000Z");
    expect(validateDomainState(seed)).toBe(true);
    expect(seed.bookings).toHaveLength(3);
    expect(seed.payments).toHaveLength(3);
    expect(seed.visits).toHaveLength(1);
    expect(seed.movements).toHaveLength(3);
    expect(seed.business.name).toBe("Boss Barber Shop by RF");
    expect(seed.business.barber.name).toBe("Roly");
  });

  it("rejects accepted monetary values with more than two decimals", () => {
    const state = base();
    expect(() =>
      recordInStorePayment(state, {
        id: "fractional-payment",
        amount: 1.239,
        method: "CASH",
        now: "2026-11-03T12:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      recordProductSale(state, {
        id: "fractional-sale",
        description: "Test",
        quantity: 1,
        amount: 1.239,
        occurredAt: "2026-11-03T12:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      addVisitItem(
        {
          ...state,
          visits: [
            {
              id: "v1",
              completedAt: "2026-11-03T12:00:00.000Z",
              items: [{ name: "Corte", price: 40, durationMinutes: 60 }],
              totalPrice: 40,
            },
          ],
        },
        "v1",
        { name: "Fracción", price: 0.001, durationMinutes: 5 },
      ),
    ).toThrow();
  });

  it("validates exception breaks even when the exception has no custom hours", () => {
    const state = base();
    expect(() =>
      validateDomainState({
        ...state,
        business: {
          ...state.business,
          exceptions: [{ date: "2026-11-04", breaks: [{ start: "bad", end: "12:00" }] }],
        },
      }),
    ).toThrow();
  });
});
