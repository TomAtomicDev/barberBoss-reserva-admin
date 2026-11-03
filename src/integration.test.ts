import { describe, expect, it } from "vite-plus/test";
import {
  createBooking,
  declarePayment,
  getAvailableSlots,
  reevaluateBookingExpirations,
  refundPayment,
  verifyPayment,
  type DomainState,
} from "./domain";
import { createLocalRepository } from "./repository";

const now = "2026-11-03T12:00:00.000Z";
const start = "2026-11-03T14:00:00.000Z";

function emptyState(): DomainState {
  return {
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
        id: "consult",
        name: "Consulta",
        price: 0,
        durationMinutes: 0,
        active: true,
        requiresConsultation: true,
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
        end: "18:00",
      })),
      exceptions: [],
    },
  };
}

function booking(state: DomainState, serviceIds = ["cut"]) {
  return createBooking(state, {
    id: "b1",
    code: "TEST",
    customer: { id: "c1", name: "Prueba", phone: "000" },
    barberId: "roly",
    source: "WEB",
    startsAt: start,
    serviceIds,
    now,
  });
}

describe("reglas de extremo a extremo del dominio local", () => {
  it("libera el intervalo justo al vencimiento y conserva solicitudes declaradas", () => {
    const initial = emptyState();
    const created = booking(initial);
    const withBooking = { ...initial, bookings: [created] };
    const slotQuery = {
      config: initial.business,
      bookings: withBooking.bookings,
      date: "2026-11-03",
      durationMinutes: 60,
    };
    expect(getAvailableSlots({ ...slotQuery, now: "2026-11-03T12:14:59.000Z" })).not.toContain(
      start,
    );
    expect(getAvailableSlots({ ...slotQuery, now: "2026-11-03T12:15:00.000Z" })).toContain(start);
    expect(
      reevaluateBookingExpirations(withBooking, "2026-11-03T12:15:00.000Z").bookings[0]?.status,
    ).toBe("EXPIRED");
    const declared = declarePayment(withBooking, "b1", {
      id: "p1",
      amount: 40,
      method: "BANK_TRANSFER",
      now: "2026-11-03T12:14:59.000Z",
    });
    expect(
      reevaluateBookingExpirations(declared, "2026-11-04T12:00:00.000Z").bookings[0]?.status,
    ).toBe("PENDING_VERIFICATION");
  });

  it("respeta excepciones y horizonte de seis semanas", () => {
    const initial = emptyState();
    const config = { ...initial.business, exceptions: [{ date: "2026-11-04", closed: true }] };
    expect(
      getAvailableSlots({ config, bookings: [], date: "2026-11-04", durationMinutes: 60, now }),
    ).toEqual([]);
    const lastDay = getAvailableSlots({
      config,
      bookings: [],
      date: "2026-12-15",
      durationMinutes: 60,
      now,
    });
    expect(lastDay).toContain("2026-12-15T12:00:00.000Z");
    expect(lastDay).not.toContain("2026-12-15T12:30:00.000Z");
    expect(
      getAvailableSlots({ config, bookings: [], date: "2026-12-16", durationMinutes: 60, now }),
    ).toEqual([]);
  });

  it("no permite reservar directamente servicios que requieren consulta", () => {
    expect(() => booking(emptyState(), ["consult"])).toThrow(/requiere consulta/);
  });

  it("informa errores de escritura sin presentar un guardado exitoso", () => {
    const storage: Storage = {
      length: 0,
      clear() {},
      getItem() {
        return null;
      },
      key() {
        return null;
      },
      removeItem() {},
      setItem() {
        throw new Error("quota");
      },
    };
    const repository = createLocalRepository(storage);
    expect(() => repository.save(emptyState())).toThrow(/No se pudieron guardar/);
  });

  it("registra devoluciones parciales sin superar el pago ni duplicar cobros", () => {
    const initial = emptyState();
    const declared = declarePayment({ ...initial, bookings: [booking(initial)] }, "b1", {
      id: "p1",
      amount: 40,
      method: "BANK_TRANSFER",
      now: "2026-11-03T12:01:00.000Z",
    });
    const verified = verifyPayment(declared, "p1", "2026-11-03T12:02:00.000Z");
    const partial = refundPayment(verified, "p1", 15, "2026-11-03T12:03:00.000Z", "r1");
    expect(partial.payments[0]?.status).toBe("VERIFIED");
    expect(() => refundPayment(partial, "p1", 26, "2026-11-03T12:04:00.000Z", "r2")).toThrow();
    const refunded = refundPayment(partial, "p1", 25, "2026-11-03T12:04:00.000Z", "r2");
    expect(refunded.payments[0]?.status).toBe("REFUNDED");
    expect(refunded.movements.filter((item) => item.kind === "PAYMENT_IN")).toHaveLength(1);
    expect(refunded.movements.filter((item) => item.kind === "REFUND_OUT")).toHaveLength(2);
  });
});
