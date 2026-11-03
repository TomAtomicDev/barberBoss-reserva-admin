import { localDateTime, validInstant, zonedDateTimeToInstant } from "./time";
import type { Booking, DomainState, Payment, Service } from "./types";

/** Fictional, editable starter data. No real customer, credential, or bank data is included. */
export function createDemoSeed(now = new Date().toISOString()): DomainState {
  const timeZone = "America/La_Paz";
  const nowMs = validInstant(now);
  const today = localDateTime(nowMs, timeZone).date;
  const schedule = [
    { weekday: 1, start: "09:00", end: "19:00", breaks: [{ start: "13:00", end: "14:00" }] },
    { weekday: 2, start: "09:00", end: "19:00", breaks: [{ start: "13:00", end: "14:00" }] },
    { weekday: 3, start: "09:00", end: "19:00", breaks: [{ start: "13:00", end: "14:00" }] },
    { weekday: 4, start: "09:00", end: "19:00", breaks: [{ start: "13:00", end: "14:00" }] },
    { weekday: 5, start: "09:00", end: "19:00", breaks: [{ start: "13:00", end: "14:00" }] },
    { weekday: 6, start: "09:00", end: "16:00", breaks: [{ start: "13:00", end: "13:30" }] },
  ];
  const previousOpenDate = findOpenDate(today, -1, timeZone, schedule);
  const firstFutureDate = findOpenDate(today, 1, timeZone, schedule);
  const secondFutureDate = findOpenDate(firstFutureDate, 1, timeZone, schedule);
  const instant = (date: string, time: string) =>
    new Date(zonedDateTimeToInstant(date, time, timeZone)).toISOString();
  const services: Service[] = [
    {
      id: "demo-cut",
      name: "Corte de pelo simple",
      price: 35,
      durationMinutes: 30,
      active: true,
      requiresConsultation: false,
    },
    {
      id: "demo-cut-design",
      name: "Corte de pelo con Diseño",
      price: 40,
      durationMinutes: 45,
      active: true,
      requiresConsultation: false,
    },
    {
      id: "demo-beard",
      name: "Afeitado de barba con vaporización",
      price: 25,
      durationMinutes: 30,
      active: true,
      requiresConsultation: false,
    },
    {
      id: "demo-color",
      name: "Tinte y coloración",
      price: 0,
      durationMinutes: 0,
      active: true,
      requiresConsultation: true,
    },
    {
      id: "demo-perm",
      name: "Rizado Base",
      price: 0,
      durationMinutes: 0,
      active: true,
      requiresConsultation: true,
    },
    {
      id: "demo-eyebrows",
      name: "Perfilado de cejas",
      price: 5,
      durationMinutes: 5,
      active: true,
      requiresConsultation: false,
    },
    {
      id: "demo-anti-dandruff",
      name: "Lavado y tratamiento anti-caspa",
      price: 10,
      durationMinutes: 10,
      active: true,
      requiresConsultation: false,
    },
  ];
  const pastCustomer = {
    id: "demo-customer-ana",
    name: "Ana Demo",
    phone: "000000000",
    preferences: { notes: "Prefiere un corte discreto", musicLink: "https://open.spotify.com/" },
  };
  const confirmedCustomer = { id: "demo-customer-luis", name: "Luis Demo", phone: "000000001" };
  const pendingCustomer = { id: "demo-customer-mateo", name: "Mateo Demo", phone: "000000002" };
  const pastStarts = instant(previousOpenDate, "10:00");
  const pastEnds = instant(previousOpenDate, "10:30");
  const futureStarts = instant(firstFutureDate, "10:00");
  const futureEnds = instant(firstFutureDate, "10:45");
  const pendingStarts = instant(secondFutureDate, "11:00");
  const pendingEnds = instant(secondFutureDate, "11:30");
  const booking = (
    id: string,
    code: string,
    customer: Booking["customer"],
    startsAt: string,
    endsAt: string,
    status: Booking["status"],
    service: Service,
    createdAt: string,
    barberId = "roly",
  ): Booking => ({
    id,
    code,
    customer,
    barberId,
    source: "WEB",
    startsAt,
    endsAt,
    status,
    items: [
      {
        serviceId: service.id,
        name: service.name,
        price: service.price,
        durationMinutes: service.durationMinutes,
      },
    ],
    totalPrice: service.price,
    createdAt,
  });
  const bookings = [
    booking(
      "demo-booking-past",
      "DEMO-101",
      pastCustomer,
      pastStarts,
      pastEnds,
      "COMPLETED",
      services[0]!,
      new Date(validInstant(pastStarts) - 24 * 60 * 60_000).toISOString(),
    ),
    booking(
      "demo-booking-confirmed",
      "DEMO-102",
      confirmedCustomer,
      futureStarts,
      futureEnds,
      "CONFIRMED",
      services[1]!,
      now,
    ),
    booking(
      "demo-booking-pending",
      "DEMO-103",
      pendingCustomer,
      pendingStarts,
      pendingEnds,
      "PENDING_VERIFICATION",
      services[2]!,
      now,
      "jhon",
    ),
  ];
  const payments: Payment[] = [
    {
      id: "demo-payment-past",
      bookingId: "demo-booking-past",
      amount: services[0]!.price,
      method: "CASH",
      status: "VERIFIED",
      createdAt: pastEnds,
    },
    {
      id: "demo-payment-confirmed",
      bookingId: "demo-booking-confirmed",
      amount: services[1]!.price,
      method: "BANK_TRANSFER",
      status: "VERIFIED",
      createdAt: now,
    },
    {
      id: "demo-payment-pending",
      bookingId: "demo-booking-pending",
      amount: services[2]!.price,
      method: "BANK_TRANSFER",
      status: "DECLARED",
      createdAt: now,
    },
  ];
  return {
    business: {
      name: "Boss Barber Shop by RF",
      barber: { id: "roly", name: "Roly F" },
      barbers: [
        { id: "roly", name: "Roly F" },
        { id: "jhon", name: "Jhon R" },
      ],
      timeZone,
      schedule,
      exceptions: [],
    },
    customers: [pastCustomer, confirmedCustomer, pendingCustomer],
    services,
    bookings,
    payments,
    visits: [
      {
        id: "demo-visit-past",
        barberId: "roly",
        bookingId: "demo-booking-past",
        customerId: pastCustomer.id,
        startsAt: pastStarts,
        endsAt: pastEnds,
        blocksAvailability: true,
        completedAt: pastEnds,
        items: [
          {
            serviceId: services[0]!.id,
            name: services[0]!.name,
            price: services[0]!.price,
            durationMinutes: services[0]!.durationMinutes,
          },
        ],
        totalPrice: services[0]!.price,
      },
    ],
    movements: [
      {
        id: "payment:demo-payment-past",
        kind: "PAYMENT_IN",
        amount: services[0]!.price,
        occurredAt: pastEnds,
        paymentId: "demo-payment-past",
      },
      {
        id: "payment:demo-payment-confirmed",
        kind: "PAYMENT_IN",
        amount: services[1]!.price,
        occurredAt: now,
        paymentId: "demo-payment-confirmed",
      },
      {
        id: "sale:demo-sale-1",
        kind: "SALE_IN",
        amount: 12,
        occurredAt: now,
        description: "Pomada demo",
      },
    ],
    bookingEvents: bookings.map((item) => ({
      id: `demo-event-${item.id}`,
      bookingId: item.id,
      action: "SEED_CREATED",
      actor: "SYSTEM",
      occurredAt: item.createdAt,
    })),
    sales: [
      { id: "demo-sale-1", description: "Pomada demo", quantity: 1, amount: 12, occurredAt: now },
    ],
  };
}

function findOpenDate(
  baseDate: string,
  direction: -1 | 1,
  timeZone: string,
  schedule: Array<{ weekday: number }>,
): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = shiftDate(baseDate, direction * offset);
    const weekday = localDateTime(
      zonedDateTimeToInstant(date, "12:00", timeZone),
      timeZone,
    ).weekday;
    if (schedule.some((rule) => rule.weekday === weekday)) return date;
  }
  throw new Error("No hay días de atención en el seed");
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}
