import { describe, expect, it } from "vite-plus/test";
import {
  completeVisit,
  createBooking,
  declarePayment,
  getAvailableSlots,
  transitionBooking,
  validateDomainState,
  verifyPayment,
} from "./index";
import type { DomainState } from "./index";

const state = (): DomainState => ({
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
  business: {
    name: "Boss Barber Shop by RF",
    barber: { id: "roly", name: "Roly" },
    timeZone: "America/La_Paz",
    schedule: [
      { weekday: 2, start: "09:00", end: "17:00", breaks: [{ start: "12:00", end: "13:00" }] },
    ],
    exceptions: [],
  },
});

describe("domain scheduling and booking rules", () => {
  it("uses business local time, 30-minute starts, lead time and breaks", () => {
    const slots = getAvailableSlots({
      config: state().business,
      bookings: [],
      date: "2026-11-03",
      durationMinutes: 60,
      now: "2026-11-03T12:00:00.000Z",
    });
    expect(slots[0]).toBe("2026-11-03T13:00:00.000Z");
    expect(slots.some((slot) => slot === "2026-11-03T16:00:00.000Z")).toBe(false);
  });

  it("snapshots service price and duration and expires after 15 minutes", () => {
    const model = state();
    const booking = createBooking(model, {
      id: "b1",
      code: "A1",
      customer: { id: "c1", name: "Demo", phone: "000" },
      barberId: "barber",
      source: "WEB",
      startsAt: "2026-11-03T13:00:00.000Z",
      serviceIds: ["cut"],
      now: "2026-11-03T12:00:00.000Z",
    });
    expect(booking.totalPrice).toBe(40);
    model.services[0]!.price = 99;
    expect(booking.items[0]!.price).toBe(40);
    expect(booking.expiresAt).toBe("2026-11-03T12:15:00.000Z");
    expect(() =>
      declarePayment({ ...model, bookings: [booking] }, "b1", {
        id: "p1",
        amount: 40,
        method: "BANK_TRANSFER",
        now: "2026-11-03T12:16:00.000Z",
      }),
    ).toThrow(/venció/);
  });

  it("preserves optional customer preferences and blocks visit intervals in all booking availability checks", () => {
    const model = state();
    const visit = {
      id: "walkin-block",
      startsAt: "2026-11-03T13:00:00.000Z",
      endsAt: "2026-11-03T14:00:00.000Z",
      blocksAvailability: true,
      completedAt: "2026-11-03T14:00:00.000Z",
      items: [{ name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
    };
    model.visits = [visit];
    const slots = getAvailableSlots({
      config: model.business,
      bookings: [],
      visits: model.visits,
      date: "2026-11-03",
      durationMinutes: 60,
      now: "2026-11-03T12:00:00.000Z",
    });
    expect(slots).not.toContain(visit.startsAt);
    expect(() =>
      createBooking(model, {
        id: "b-visit-conflict",
        code: "BVC",
        customer: {
          id: "c1",
          name: "Demo",
          phone: "000",
          preferences: { notes: "Sin máquina", musicLink: "https://open.spotify.com/" },
        },
        barberId: "roly",
        source: "WEB",
        startsAt: visit.startsAt,
        serviceIds: ["cut"],
        now: "2026-11-03T12:00:00.000Z",
      }),
    ).toThrow(/no está disponible/);
    const valid = createBooking(
      { ...model, visits: [] },
      {
        id: "b-pref",
        code: "BP",
        customer: {
          id: "c2",
          name: "Demo 2",
          phone: "001",
          preferences: { notes: "Fade", musicLink: "https://open.spotify.com/" },
        },
        barberId: "roly",
        source: "WEB",
        startsAt: "2026-11-03T14:00:00.000Z",
        serviceIds: ["cut"],
        now: "2026-11-03T12:00:00.000Z",
      },
    );
    expect(valid.customer.preferences).toEqual({
      notes: "Fade",
      musicLink: "https://open.spotify.com/",
    });
    expect(() =>
      validateDomainState({
        ...model,
        bookings: [{ ...valid, customer: { id: "broken" }, status: "NOT_A_STATUS" }],
        visits: [],
      }),
    ).toThrow();
  });

  it("keeps booking and payment transitions independent and avoids duplicate visit receipts", () => {
    const model = state();
    const booking = createBooking(model, {
      id: "b1",
      code: "A1",
      customer: { id: "c1", name: "Demo", phone: "000" },
      barberId: "barber",
      source: "WEB",
      startsAt: "2026-11-03T13:00:00.000Z",
      serviceIds: ["cut"],
      now: "2026-11-03T12:00:00.000Z",
    });
    const declared = declarePayment({ ...model, bookings: [booking] }, "b1", {
      id: "p1",
      amount: 10,
      method: "BANK_TRANSFER",
      now: "2026-11-03T12:01:00.000Z",
    });
    expect(declared.bookings[0]!.status).toBe("PENDING_VERIFICATION");
    expect(declared.payments[0]!.status).toBe("DECLARED");
    const verified = verifyPayment(declared, "p1", "2026-11-03T12:02:00.000Z");
    expect(verified.bookings[0]!.status).toBe("PENDING_VERIFICATION");
    expect(verified.movements).toHaveLength(1);
    const afterVisit = completeVisit(verified, {
      id: "v1",
      bookingId: "b1",
      completedAt: "2026-11-03T14:00:00.000Z",
      items: [{ name: "Corte", price: 40, durationMinutes: 60 }],
      totalPrice: 40,
    });
    expect(afterVisit.movements).toHaveLength(1);
    expect(() =>
      completeVisit(afterVisit, {
        id: "v2",
        bookingId: "b1",
        completedAt: "2026-11-03T14:30:00.000Z",
        items: [{ name: "Corte", price: 40, durationMinutes: 60 }],
        totalPrice: 40,
      }),
    ).toThrow(/ya tiene una atención/);
    expect(transitionBooking(afterVisit.bookings, "b1", "CONFIRMED")[0]!.status).toBe("CONFIRMED");
  });

  it("omits nonexistent DST slot times but does not swallow invalid timezone or schedule configuration", () => {
    const config = {
      ...state().business,
      timeZone: "America/New_York",
      schedule: [{ weekday: 0, start: "01:00", end: "04:00" }],
    };
    const slots = getAvailableSlots({
      config,
      bookings: [],
      date: "2026-03-08",
      durationMinutes: 30,
      now: "2026-03-07T12:00:00.000Z",
    });
    const localTimes = slots.map((slot) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: config.timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(slot)),
    );
    expect(localTimes).toEqual(["01:00", "01:30", "03:00", "03:30"]);
    expect(() =>
      getAvailableSlots({
        config: { ...config, timeZone: "Not/A_Timezone" },
        bookings: [],
        date: "2026-03-08",
        durationMinutes: 30,
        now: "2026-03-07T12:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      getAvailableSlots({
        config: { ...config, schedule: [{ weekday: 0, start: "25:00", end: "26:00" }] },
        bookings: [],
        date: "2026-03-08",
        durationMinutes: 30,
        now: "2026-03-07T12:00:00.000Z",
      }),
    ).toThrow();
  });
});
