/**
 * Presentation contract for AdminApp. Instants are ISO strings, business-local
 * schedule values stay local, and monetary values are integer BOB centavos.
 */
export type BookingStatus =
  | "AWAITING_PAYMENT_NOTICE"
  | "PENDING_VERIFICATION"
  | "CONFIRMED"
  | "EXPIRED"
  | "REJECTED"
  | "CANCELLED"
  | "NO_SHOW"
  | "COMPLETED";

/** Wall-clock value in the configured business timezone; never a UTC instant. */
export type BusinessLocalDateTime = string;

export interface AdminBookingEvent {
  id: string;
  bookingId: string;
  bookingCode: string;
  action: string;
  actor: string;
  occurredAt: string;
  reason?: string;
  changes?: Record<string, unknown>;
}

export interface AdminCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  note?: string;
  musicLink?: string;
  bookingCount: number;
  lastVisitAt?: string;
  events?: AdminBookingEvent[];
}

export interface AdminService {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  requiresConsultation: boolean;
}

export interface AdminBookingItem {
  serviceId?: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}

export interface AdminBooking {
  id: string;
  code: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  source: "web-demo" | "phone" | "walk-in";
  items: AdminBookingItem[];
  totalCents: number;
  paymentLabel?: string;
  canApprove?: boolean;
  /** Customer instructions and music preference carried on the booking. */
  note?: string;
  musicLink?: string;
  events?: AdminBookingEvent[];
  isVisit?: boolean;
}

export interface AdminMoneyMovement {
  id: string;
  createdAt: string;
  kind: "payment" | "sale" | "refund";
  description: string;
  customerName?: string;
  amountCents: number;
  method?: string;
  canRefund?: boolean;
  refundableCents?: number;
}

export interface AdminVisit {
  id: string;
  completedAt: string;
  customerName: string;
  items: Array<{ name: string; priceCents: number; durationMinutes: number }>;
  totalCents: number;
}

export interface AdminScheduleDay {
  weekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
  breakStartsAt?: string;
  breakEndsAt?: string;
}

export interface AdminException {
  id: string;
  date: string;
  label: string;
  closed: boolean;
  opensAt?: string;
  closesAt?: string;
}

export interface AdminSummary {
  bookingsToday: number;
  pendingRequests: number;
  visitsToday: number;
  collectedCents: number;
  refundedCents: number;
}

export interface AdminData {
  businessName: string;
  /** Barber display name from configuration; falls back to the confirmed demo name. */
  barberName?: string;
  timezone: string;
  summary: AdminSummary;
  bookings: AdminBooking[];
  customers: AdminCustomer[];
  services: AdminService[];
  movements: AdminMoneyMovement[];
  visits: AdminVisit[];
  schedule: AdminScheduleDay[];
  exceptions: AdminException[];
}

export interface BookingDraft {
  customerName: string;
  customerPhone: string;
  /** `YYYY-MM-DDTHH:mm` in `AdminData.timezone`, without offset conversion. */
  startsAt: BusinessLocalDateTime;
  serviceIds: string[];
  agreedPriceCents?: number;
  agreedDurationMinutes?: number;
  note?: string;
}

export interface RescheduleDraft {
  bookingId: string;
  /** `YYYY-MM-DDTHH:mm` in `AdminData.timezone`, without offset conversion. */
  startsAt: BusinessLocalDateTime;
  reason?: string;
}

export interface WalkInDraft {
  customerName: string;
  customerPhone: string;
  serviceIds: string[];
  note?: string;
  paymentCents?: number;
  paymentMethod?: string;
}

export interface VisitDraft {
  bookingId?: string;
  customerId?: string;
  customerName: string;
  items: Array<{ serviceId?: string; name: string; priceCents: number; durationMinutes: number }>;
  paymentCents?: number;
  paymentMethod?: string;
}

export interface SaleDraft {
  description: string;
  quantity: number;
  amountCents: number;
  customerId?: string;
  paymentMethod?: string;
}

export interface RefundDraft {
  movementId: string;
  amountCents: number;
  reason: string;
}

export interface ServiceDraft extends Omit<AdminService, "id"> {
  id?: string;
}

export interface ScheduleDraft {
  schedule: AdminScheduleDay[];
  exceptions: Array<Omit<AdminException, "id"> & { id?: string }>;
}

export interface AdminCallbacks {
  onEnterDemo: (role: "Propietario" | "Barbero") => void;
  onApproveRequest: (bookingId: string) => void;
  onRejectRequest: (bookingId: string, reason?: string) => void;
  onReleaseRequest: (bookingId: string, reason?: string) => void;
  onCreatePhoneBooking: (draft: BookingDraft) => void;
  onRescheduleBooking: (draft: RescheduleDraft) => void;
  onCancelBooking: (bookingId: string, reason?: string) => void;
  onMarkNoShow: (bookingId: string) => void;
  onCreateWalkIn: (draft: WalkInDraft) => void;
  onCompleteVisit: (draft: VisitDraft) => void;
  onRecordSale: (draft: SaleDraft) => void;
  onRecordRefund: (draft: RefundDraft) => void;
  onSaveService: (draft: ServiceDraft) => void;
  onSaveSchedule: (draft: ScheduleDraft) => void;
  onRestoreDemoData: () => void;
  onRetryStorage?: () => void;
}

export interface AdminAppProps extends AdminCallbacks {
  data: AdminData;
  /** Login is visual only; the host controls which screen is shown. */
  demoAccessGranted: boolean;
  /** Storage error to present verbatim in an accessible alert. */
  storageError?: string | null;
  /** Optional non-persistent operation feedback supplied by the host. */
  feedback?: { kind: "success" | "error"; message: string } | null;
  /** True while the host is applying a command; no local optimistic mutation. */
  busy?: boolean;
  /** Unsupported domain operations remain visible but disabled with an explanation. */
  unavailableActions?: Partial<Record<"saveService" | "createWalkIn", string>>;
}
