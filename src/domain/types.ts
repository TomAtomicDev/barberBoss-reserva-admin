export type BookingStatus =
  | "AWAITING_PAYMENT_NOTICE"
  | "PENDING_VERIFICATION"
  | "CONFIRMED"
  | "EXPIRED"
  | "REJECTED"
  | "CANCELLED"
  | "NO_SHOW"
  | "COMPLETED";

export type PaymentStatus = "DECLARED" | "VERIFIED" | "REJECTED" | "REFUNDED";
export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "OTHER";
export type MovementKind = "PAYMENT_IN" | "REFUND_OUT" | "SALE_IN" | "MANUAL_IN" | "MANUAL_OUT";

export interface Service {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  requiresConsultation: boolean;
}

export interface BookingItemSnapshot {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  preferences?: {
    notes?: string;
    musicLink?: string;
  };
}

export interface Booking {
  id: string;
  code: string;
  customer: Customer;
  barberId: string;
  source: "WEB" | "PHONE" | "WALK_IN";
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  items: BookingItemSnapshot[];
  totalPrice: number;
  createdAt: string;
  expiresAt?: string;
}

export interface BookingEvent {
  id: string;
  bookingId: string;
  action: string;
  actor: "CUSTOMER" | "OWNER" | "BARBER" | "SYSTEM";
  occurredAt: string;
  reason?: string;
  changes?: Record<string, unknown>;
}

export interface Payment {
  id: string;
  bookingId?: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
}

export interface ScheduleRule {
  weekday: number;
  start: string;
  end: string;
  breaks?: Array<{ start: string; end: string }>;
}

export interface ScheduleException {
  date: string;
  closed?: boolean;
  start?: string;
  end?: string;
  breaks?: Array<{ start: string; end: string }>;
}

export interface BusinessConfig {
  name: string;
  barber: { id: string; name: string };
  timeZone: string;
  schedule: ScheduleRule[];
  exceptions: ScheduleException[];
}

export interface ServiceVisitItem {
  serviceId?: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface ServiceVisit {
  id: string;
  bookingId?: string;
  customerId?: string;
  startsAt?: string;
  endsAt?: string;
  blocksAvailability?: boolean;
  completedAt: string;
  items: ServiceVisitItem[];
  totalPrice: number;
}

export interface MoneyMovement {
  id: string;
  kind: MovementKind;
  amount: number;
  occurredAt: string;
  paymentId?: string;
  visitId?: string;
  description?: string;
}

export interface ProductSale {
  id: string;
  description: string;
  quantity: number;
  amount: number;
  method?: PaymentMethod;
  occurredAt: string;
}

export interface DomainState {
  /** Optional for backwards compatibility with existing v1 snapshots. */
  customers?: Customer[];
  services: Service[];
  bookings: Booking[];
  payments: Payment[];
  visits: ServiceVisit[];
  movements: MoneyMovement[];
  bookingEvents: BookingEvent[];
  sales: ProductSale[];
  business: BusinessConfig;
}

export interface CreateBookingInput {
  id: string;
  code: string;
  customer: Customer;
  barberId: string;
  source: Booking["source"];
  startsAt: string;
  serviceIds: string[];
  now: string;
}

export interface CreatePhoneBookingInput extends CreateBookingInput {
  source: "PHONE";
  agreedServices?: Array<{
    serviceId: string;
    name?: string;
    price: number;
    durationMinutes: number;
  }>;
}
