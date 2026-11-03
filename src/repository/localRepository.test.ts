import { describe, expect, it } from "vite-plus/test";
import { createLocalRepository, RepositoryError, STORAGE_SCHEMA_VERSION } from "./index";
import { createDemoSeed } from "../domain";
import type { DomainState } from "../domain";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  get length() {
    return this.values.size;
  }
}

const initial: DomainState = {
  services: [],
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
    schedule: [],
    exceptions: [],
  },
};

describe("versioned local repository", () => {
  it("initializes, saves and loads validated versioned state", () => {
    const storage = new MemoryStorage();
    const repository = createLocalRepository(storage as unknown as Storage, "test");
    expect(repository.initialize(initial)).toEqual(initial);
    expect(JSON.parse(storage.getItem("test")!).schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    repository.save({
      ...initial,
      services: [
        {
          id: "x",
          name: "X",
          price: 10,
          durationMinutes: 30,
          active: true,
          requiresConsultation: false,
        },
      ],
    });
    expect(repository.load()?.services[0]?.id).toBe("x");
  });

  it("does not silently overwrite incompatible/corrupt data; restore requires confirmation", () => {
    const storage = new MemoryStorage();
    storage.setItem("test", JSON.stringify({ schemaVersion: 99, data: initial }));
    const repository = createLocalRepository(storage as unknown as Storage, "test");
    expect(() => repository.load()).toThrow(RepositoryError);
    expect(() => repository.save(initial)).toThrow(RepositoryError);
    expect(() => repository.restore(initial, false)).toThrow(RepositoryError);
    expect(JSON.parse(storage.getItem("test")!).schemaVersion).toBe(99);
    repository.restore(initial, true);
    expect(repository.load()).toEqual(initial);
  });

  it("reports invalid content instead of returning it", () => {
    const storage = new MemoryStorage();
    storage.setItem("test", "not-json");
    expect(() => createLocalRepository(storage as unknown as Storage, "test").load()).toThrow(
      RepositoryError,
    );
  });

  it("persists optional customer profiles, preferences and visit intervals", () => {
    const storage = new MemoryStorage();
    const repository = createLocalRepository(storage as unknown as Storage, "test");
    const seeded = createDemoSeed("2026-11-03T12:00:00.000Z");
    repository.save(seeded);
    const loaded = repository.load()!;
    expect(loaded.customers?.[0]?.preferences?.notes).toBe("Prefiere un corte discreto");
    expect(loaded.customers?.[0]?.preferences?.musicLink).toBe("https://open.spotify.com/");
    expect(loaded.visits[0]?.startsAt).toBeDefined();
    expect(loaded.visits[0]?.blocksAvailability).toBe(true);
  });

  it("rejects corrupt booking, customer, enum, schedule, payment and visit shapes without overwriting them", () => {
    const base = createDemoSeed("2026-11-03T12:00:00.000Z");
    const mutations: Array<(data: DomainState) => void> = [
      (data) => {
        (data.bookings[0] as unknown as { customer?: unknown }).customer = undefined;
      },
      (data) => {
        (data.bookings[0] as unknown as { status: string }).status = "BROKEN";
      },
      (data) => {
        (data.bookings[0] as unknown as { source: string }).source = "UNKNOWN";
      },
      (data) => {
        (data.business.schedule[0] as { weekday: number }).weekday = 9;
      },
      (data) => {
        (data.payments[0] as unknown as { status: string }).status = "UNPAID";
      },
      (data) => {
        (data.visits[0] as unknown as { endsAt: string }).endsAt = "2020-01-01T00:00:00Z";
      },
      (data) => {
        data.business.exceptions = [
          { date: "2026-11-04", breaks: [{ start: "not-a-time", end: "12:00" }] },
        ];
      },
      (data) => {
        (data.bookings[0] as unknown as { status: string; expiresAt?: string }).status =
          "AWAITING_PAYMENT_NOTICE";
        delete (data.bookings[0] as unknown as { expiresAt?: string }).expiresAt;
      },
      (data) => {
        data.visits.push({ ...data.visits[0]!, id: "second-visit-same-booking" });
      },
      (data) => {
        (data.services[0] as { price: number }).price = 40.001;
      },
    ];
    const storage = new MemoryStorage();
    const repository = createLocalRepository(storage as unknown as Storage, "test");
    for (const mutate of mutations) {
      const corrupt = structuredClone(base);
      mutate(corrupt);
      const raw = JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION, data: corrupt });
      storage.setItem("test", raw);
      expect(() => repository.load()).toThrow(RepositoryError);
      expect(storage.getItem("test")).toBe(raw);
    }
  });

  it("refuses save over corrupt JSON and leaves it byte-for-byte intact", () => {
    const storage = new MemoryStorage();
    const raw = '{"schemaVersion":1,"data":{"corrupt":true}}';
    storage.setItem("test", raw);
    const repository = createLocalRepository(storage as unknown as Storage, "test");
    expect(() => repository.save(initial)).toThrow(RepositoryError);
    expect(storage.getItem("test")).toBe(raw);
    expect(() => repository.initialize(initial)).toThrow(RepositoryError);
  });
});
