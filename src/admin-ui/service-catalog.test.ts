import { describe, expect, it } from "vite-plus/test";
import { createDemoSeed, validateDomainState } from "../domain";
import { updateServiceCatalog } from "./service-catalog";

describe("updateServiceCatalog", () => {
  it("creates a service immutably and accepts consultation services without a fixed duration", () => {
    const state = createDemoSeed();
    const next = updateServiceCatalog(
      state,
      {
        name: "  Color personalizado  ",
        priceCents: 0,
        durationMinutes: 0,
        active: true,
        requiresConsultation: true,
      },
      () => "new-color",
    );

    expect(next).not.toBe(state);
    expect(next.services).not.toBe(state.services);
    expect(state.services).toHaveLength(7);
    expect(next.services.at(-1)).toEqual({
      id: "new-color",
      name: "Color personalizado",
      price: 0,
      durationMinutes: 0,
      active: true,
      requiresConsultation: true,
    });
    expect(validateDomainState(next)).toBe(true);
  });

  it("edits the catalog record without changing historical booking snapshots", () => {
    const state = createDemoSeed();
    const booking = {
      id: "booking-1",
      code: "DEMO1",
      customer: { id: "c1", name: "Prueba", phone: "000" },
      barberId: "roly",
      source: "PHONE" as const,
      startsAt: "2026-11-04T14:00:00.000Z",
      endsAt: "2026-11-04T14:45:00.000Z",
      status: "CONFIRMED" as const,
      items: [{ serviceId: "demo-cut", name: "Corte clásico", price: 40, durationMinutes: 45 }],
      totalPrice: 40,
      createdAt: "2026-11-03T12:00:00.000Z",
    };
    const withBooking = { ...state, bookings: [...state.bookings, booking] };
    const next = updateServiceCatalog(
      withBooking,
      {
        id: "demo-cut",
        name: "Corte nuevo",
        priceCents: 5_000,
        durationMinutes: 50,
        active: false,
        requiresConsultation: false,
      },
      () => "unused",
    );

    expect(next.services.find((service) => service.id === "demo-cut")).toMatchObject({
      name: "Corte nuevo",
      price: 50,
      durationMinutes: 50,
      active: false,
    });
    expect(next.bookings).toBe(withBooking.bookings);
    expect(next.bookings[0]?.items[0]).toEqual({
      serviceId: "demo-cut",
      name: "Corte de pelo simple",
      price: 35,
      durationMinutes: 30,
    });
    expect(validateDomainState(next)).toBe(true);
  });

  it("rejects duplicate names, zero reservable prices, invalid prices, and missing durations", () => {
    const state = createDemoSeed();
    const create = (overrides: Partial<Parameters<typeof updateServiceCatalog>[1]>) =>
      updateServiceCatalog(
        state,
        {
          name: "Corte de pelo simple",
          priceCents: 4_000,
          durationMinutes: 30,
          active: true,
          requiresConsultation: false,
          ...overrides,
        },
        () => "new",
      );

    expect(() => create({ name: " corte DE PELO SIMPLE " })).toThrow(/Ya existe/);
    expect(() => create({ priceCents: -1 })).toThrow(/precio/i);
    expect(() => create({ priceCents: 1.5 })).toThrow(/precio/i);
    expect(() => create({ priceCents: 0 })).toThrow(/precio mayor que cero/i);
    expect(() => create({ durationMinutes: 0 })).toThrow(/duración/i);
    expect(() => create({ durationMinutes: -5, requiresConsultation: true })).toThrow(/duración/i);
    expect(() =>
      create({ name: "Consulta", priceCents: 0, durationMinutes: 0, requiresConsultation: true }),
    ).not.toThrow();
  });

  it("rejects an id collision from the id generator", () => {
    const state = createDemoSeed();
    expect(() =>
      updateServiceCatalog(
        state,
        {
          name: "Producto nuevo",
          priceCents: 1_000,
          durationMinutes: 15,
          active: true,
          requiresConsultation: false,
        },
        () => "demo-cut",
      ),
    ).toThrow(/identificador único/);
  });

  it("rejects an existing service id that is already duplicated in state", () => {
    const state = createDemoSeed();
    const duplicate = { ...state.services[0]!, name: "Copia duplicada" };
    const invalidState = { ...state, services: [...state.services, duplicate] };
    expect(() =>
      updateServiceCatalog(
        invalidState,
        {
          id: "demo-cut",
          name: "Corte actualizado",
          priceCents: 4_500,
          durationMinutes: 45,
          active: true,
          requiresConsultation: false,
        },
        () => "unused",
      ),
    ).toThrow(/identificadores de servicio duplicados/);
  });
});
