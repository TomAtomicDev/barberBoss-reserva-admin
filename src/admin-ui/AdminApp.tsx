import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import "./admin.css";
import type {
  AdminAppProps,
  AdminBooking,
  AdminBookingEvent,
  AdminCustomer,
  BookingDraft,
  RescheduleDraft,
  VisitDraft,
} from "./types";

type Page = "agenda" | "requests" | "customers" | "money" | "settings";
type Dialog =
  | "booking"
  | "reschedule"
  | "walkin"
  | "visit"
  | "sale"
  | "refund"
  | "service"
  | "schedule"
  | "restore"
  | null;

const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`;
function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

const dateParts = (instant: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;
const businessDateKey = (instant: Date, timeZone: string) => {
  const parts = dateParts(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const businessDateTimeLocal = (instant: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", string>;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const shiftDateKey = (dateKey: string, amount: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
};
const weekdayOfDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
};
const dateLabel = (
  dateKey: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-BO", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day, 12)),
  );
};
const dayLabel = (dateKey: string) =>
  dateLabel(dateKey, { weekday: "long", day: "numeric", month: "long" });
const timeLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("es-BO", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
const dateTimeLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("es-BO", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
const businessDateTimeInput = (iso: string | undefined, timeZone: string) =>
  businessDateTimeLocal(iso ? new Date(iso) : new Date(Date.now() + 2 * 60 * 60 * 1000), timeZone);
const statusLabels: Record<AdminBooking["status"], string> = {
  AWAITING_PAYMENT_NOTICE: "Esperando aviso",
  PENDING_VERIFICATION: "Por revisar",
  CONFIRMED: "Confirmada",
  EXPIRED: "Vencida",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
  COMPLETED: "Atendida",
};

function Icon({
  name,
}: {
  name:
    | "calendar"
    | "inbox"
    | "people"
    | "cash"
    | "settings"
    | "plus"
    | "clock"
    | "scissors"
    | "arrow";
}) {
  const paths: Record<typeof name, ReactNode> = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 4h16l2 11h-6l-2 3h-4l-2-3H2L4 4Z" />
        <path d="M8 10h8" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1" />
      </>
    ),
    cash: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 9h.01M18 15h.01" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.9Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    scissors: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m8.2 8.2 12 12m-12-4.4 12-12M14 12l6 6" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="admin-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function AdminApp(props: AdminAppProps) {
  const [page, setPage] = useState<Page>("agenda");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedSnapshot, setSelectedBooking] = useState<AdminBooking | null>(null);
  const selectedBooking = selectedSnapshot
    ? (props.data.bookings.find((booking) => booking.id === selectedSnapshot.id) ??
      selectedSnapshot)
    : null;
  const [selectedMovement, setSelectedMovement] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => businessDateKey(new Date(), props.data.timezone));
  const [search, setSearch] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [formError, setFormError] = useState("");
  const busy = Boolean(props.busy);
  const barberName = props.data.barberName ?? "Roly";
  const nav: Array<{ id: Page; label: string; icon: Parameters<typeof Icon>[0]["name"] }> = [
    { id: "agenda", label: "Agenda", icon: "calendar" },
    { id: "requests", label: "Solicitudes", icon: "inbox" },
    { id: "customers", label: "Clientes", icon: "people" },
    { id: "money", label: "Movimientos", icon: "cash" },
    { id: "settings", label: "Ajustes", icon: "settings" },
  ];
  const visibleBookings = useMemo(() => {
    const start = period === "week" ? shiftDateKey(anchor, -weekdayOfDateKey(anchor)) : anchor;
    const end = shiftDateKey(start, period === "week" ? 7 : 1);
    return props.data.bookings
      .filter((item) => {
        const bookingDate = businessDateKey(new Date(item.startsAt), props.data.timezone);
        return (
          bookingDate >= start &&
          bookingDate < end &&
          !["CANCELLED", "REJECTED", "EXPIRED"].includes(item.status)
        );
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [anchor, period, props.data.bookings, props.data.timezone]);
  const requests = props.data.bookings.filter((item) =>
    ["AWAITING_PAYMENT_NOTICE", "PENDING_VERIFICATION"].includes(item.status),
  );
  const customers = props.data.customers.filter((customer) =>
    `${customer.name} ${customer.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  const weekStart = shiftDateKey(anchor, -weekdayOfDateKey(anchor));
  const todayLabel = dayLabel(anchor);

  const openFor = (name: Dialog, booking?: AdminBooking) => {
    setSelectedBooking(booking ?? null);
    setFormError("");
    setDialog(name);
  };
  const submit = (event: FormEvent<HTMLFormElement>, action: (form: FormData) => void) => {
    event.preventDefault();
    try {
      action(new FormData(event.currentTarget));
      setFormError("");
      setDialog(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar el formulario.");
    }
  };
  const closeDialog = () => {
    setDialog(null);
    setConfirmRestore(false);
  };

  useEffect(() => {
    if (!props.demoAccessGranted || (!dialog && !(page === "agenda" && selectedSnapshot?.id)))
      return;
    const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (!modal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (dialog) {
          setDialog(null);
          setConfirmRestore(false);
        } else setSelectedBooking(null);
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [dialog, page, props.demoAccessGranted, selectedSnapshot?.id]);

  if (!props.demoAccessGranted)
    return (
      <main className="admin-login">
        <section className="admin-login-panel" aria-labelledby="login-title">
          <div className="admin-brandmark">
            <Icon name="scissors" />
          </div>
          <p className="admin-kicker">PANEL DE DEMOSTRACIÓN</p>
          <h1 id="login-title">
            Un buen día
            <br />
            empieza en la silla.
          </h1>
          <p className="admin-login-copy">
            Explora la gestión de {props.data.businessName}, con {barberName} en la silla y datos
            ficticios. No hace falta una contraseña.
          </p>
          <div className="admin-warning">
            <strong>Acceso visual, no privado</strong>
            <span>
              Esta pantalla no protege rutas ni datos. Usa solo información inventada; los cambios
              dependen de este navegador.
            </span>
          </div>
          <button
            className="admin-button admin-button-primary admin-wide"
            disabled={busy}
            onClick={() => props.onEnterDemo("Propietario")}
          >
            Entrar como propietario <Icon name="arrow" />
          </button>
          <button
            className="admin-button admin-button-quiet admin-wide"
            disabled={busy}
            onClick={() => props.onEnterDemo("Barbero")}
          >
            Ver como barbero
          </button>
        </section>
        <div className="admin-login-side">
          <span>{props.data.businessName}</span>
          <p>
            Oficio, tiempo
            <br />y buen trato.
          </p>
          <small>Demo navegable · datos de prueba</small>
        </div>
      </main>
    );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a
          className="admin-logo"
          href="#/admin"
          aria-label={`${props.data.businessName}, agenda`}
          onClick={(event) => {
            event.preventDefault();
            setPage("agenda");
          }}
        >
          <span className="admin-logo-icon">
            <Icon name="scissors" />
          </span>
          <span>
            Boss Barber Shop<small>by RF · DEMO</small>
          </span>
        </a>
        <div className="admin-user">
          <span className="admin-avatar">RF</span>
          <span>
            <strong>{props.data.businessName}</strong>
            <small>Barbero: {barberName} · Demo</small>
          </span>
          <span className="admin-presence" aria-label="Modo demo" />
        </div>
        <nav className="admin-nav" aria-label="Administración">
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "is-active" : ""}
              onClick={() => setPage(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === "requests" && requests.length > 0 && (
                <span className="admin-nav-count">{requests.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <span className="admin-demo-dot" /> Demo local <small>Sin sincronización</small>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-mobile-brand">
              <Icon name="scissors" /> Boss Barber Shop by RF
            </span>
            <span className="admin-live">
              <i /> VISTA DE DEMOSTRACIÓN
            </span>
          </div>
          <button
            className="admin-avatar admin-avatar-button"
            aria-label="Volver a la agenda"
            onClick={() => setPage("agenda")}
          >
            RF
          </button>
        </header>
        {(props.storageError || props.feedback) && (
          <div
            className={`admin-message ${props.storageError || props.feedback?.kind === "error" ? "is-error" : "is-success"}`}
            role={props.storageError || props.feedback?.kind === "error" ? "alert" : "status"}
          >
            <span>{props.storageError ?? props.feedback?.message}</span>
            {props.storageError && props.onRetryStorage && (
              <button disabled={busy} onClick={props.onRetryStorage}>
                Intentar de nuevo
              </button>
            )}
          </div>
        )}
        <div className="admin-demo-notice">
          <span className="admin-notice-icon">i</span>
          <p>
            <strong>Solo en este navegador.</strong> La agenda y las solicitudes no se comparten ni
            garantizan disponibilidad real. No uses datos personales.
          </p>
        </div>

        {page === "agenda" && (
          <>
            <div className="admin-page-heading">
              <div>
                <p className="admin-kicker">TU ESTUDIO, A LA VISTA</p>
                <h1>Agenda</h1>
                <p className="admin-subtitle">Organiza el día, sin perder el trato de siempre.</p>
              </div>
              <div className="admin-heading-actions">
                <button
                  className="admin-button admin-button-outline"
                  disabled={busy}
                  onClick={() => openFor("walkin")}
                >
                  <Icon name="plus" /> Walk-in
                </button>
                <button
                  className="admin-button admin-button-primary"
                  disabled={busy}
                  onClick={() => openFor("booking")}
                >
                  <Icon name="plus" /> Nueva reserva
                </button>
              </div>
            </div>
            <div className="admin-stats">
              <Stat label="Citas de hoy" value={props.data.summary.bookingsToday} />
              <Stat label="Por revisar" value={props.data.summary.pendingRequests} accent />
              <Stat label="Atenciones" value={props.data.summary.visitsToday} />
              <Stat label="Cobrado en demo" value={money(props.data.summary.collectedCents)} />
            </div>
            <section className="admin-agenda-panel">
              <div className="admin-agenda-toolbar">
                <div className="admin-date-control">
                  <button
                    aria-label="Periodo anterior"
                    onClick={() =>
                      setAnchor((current) => shiftDateKey(current, -(period === "day" ? 1 : 7)))
                    }
                  >
                    ‹
                  </button>
                  <div>
                    <strong>
                      {period === "day" ? todayLabel : `Semana de ${dayLabel(weekStart)}`}
                    </strong>
                    <small>{props.data.timezone}</small>
                  </div>
                  <button
                    aria-label="Periodo siguiente"
                    onClick={() =>
                      setAnchor((current) => shiftDateKey(current, period === "day" ? 1 : 7))
                    }
                  >
                    ›
                  </button>
                </div>
                <div className="admin-segment" aria-label="Vista de agenda">
                  <button
                    className={period === "day" ? "selected" : ""}
                    onClick={() => setPeriod("day")}
                  >
                    Día
                  </button>
                  <button
                    className={period === "week" ? "selected" : ""}
                    onClick={() => setPeriod("week")}
                  >
                    Semana
                  </button>
                </div>
              </div>
              <div className="admin-agenda-list">
                {visibleBookings.length ? (
                  visibleBookings.map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      timeZone={props.data.timezone}
                      onClick={() => {
                        setSelectedBooking(booking);
                      }}
                    />
                  ))
                ) : (
                  <div className="admin-empty">
                    <span>
                      <Icon name="calendar" />
                    </span>
                    <strong>Un espacio para un buen corte</strong>
                    <p>No hay reservas para este periodo en los datos recibidos.</p>
                    <button
                      className="admin-button admin-button-outline"
                      onClick={() => openFor("booking")}
                    >
                      Crear reserva telefónica
                    </button>
                  </div>
                )}
              </div>
            </section>
            {selectedBooking && !dialog && (
              <BookingDetail
                booking={selectedBooking}
                timeZone={props.data.timezone}
                busy={busy}
                close={() => setSelectedBooking(null)}
                actions={{
                  reschedule: () => openFor("reschedule", selectedBooking),
                  cancel: () => props.onCancelBooking(selectedBooking.id),
                  noShow: () => props.onMarkNoShow(selectedBooking.id),
                  visit: () => openFor("visit", selectedBooking),
                }}
              />
            )}
          </>
        )}

        {page === "requests" && (
          <>
            <PageHeading
              kicker="ENTRADAS LOCALES"
              title="Solicitudes"
              subtitle="Revisa lo recibido en este navegador antes de decidir."
            />
            <div className="admin-request-caution">
              Aprobar solo actualiza el estado del demo. No verifica el banco ni confirma que el
              dinero se haya recibido. Las solicitudes provisionales solo se pueden liberar.
            </div>
            <div className="admin-request-list">
              {requests.length ? (
                requests.map((item) => (
                  <article className="admin-request" key={item.id}>
                    <div className="admin-request-top">
                      <span className="admin-status is-pending">{statusLabels[item.status]}</span>
                      <span>
                        {timeLabel(item.startsAt, props.data.timezone)} ·{" "}
                        {dateLabel(businessDateKey(new Date(item.startsAt), props.data.timezone))}
                      </span>
                    </div>
                    <h2>{item.customerName}</h2>
                    <p>
                      {item.items.map((line) => line.name).join(" + ")}{" "}
                      <span>· {money(item.totalCents)}</span>
                    </p>
                    {item.paymentLabel && <p className="admin-request-meta">{item.paymentLabel}</p>}
                    <div className="admin-request-meta">
                      {item.code} <span>·</span> {item.customerPhone}
                    </div>
                    <div className="admin-request-actions">
                      {item.status === "PENDING_VERIFICATION" && (
                        <>
                          <button
                            className="admin-button admin-button-primary"
                            disabled={busy || !item.canApprove}
                            title={
                              !item.canApprove
                                ? "Se necesita un pago declarado para aprobar esta solicitud."
                                : undefined
                            }
                            onClick={() => props.onApproveRequest(item.id)}
                          >
                            Aprobar en demo
                          </button>
                          <button
                            className="admin-button admin-button-outline"
                            disabled={busy}
                            onClick={() => props.onRejectRequest(item.id)}
                          >
                            Rechazar
                          </button>
                          <button
                            className="admin-button admin-button-quiet"
                            disabled={busy}
                            onClick={() => props.onReleaseRequest(item.id)}
                          >
                            Liberar horario
                          </button>
                        </>
                      )}
                      {item.status === "AWAITING_PAYMENT_NOTICE" && (
                        <button
                          className="admin-button admin-button-quiet"
                          disabled={busy}
                          onClick={() => props.onReleaseRequest(item.id)}
                        >
                          Liberar solicitud provisional
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="No hay solicitudes por revisar"
                  copy="Las solicitudes del navegador actual aparecerán aquí."
                />
              )}
            </div>
          </>
        )}

        {page === "customers" && (
          <>
            <PageHeading
              kicker="PERSONAS, NO SOLO CITAS"
              title="Clientes"
              subtitle="Historial ficticio recibido del sistema."
            />
            <label className="admin-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o teléfono"
                aria-label="Buscar clientes"
              />
            </label>
            <div className="admin-customer-table">
              <div className="admin-table-head">
                <span>Cliente</span>
                <span>Teléfono</span>
                <span>Visitas</span>
                <span>Última atención</span>
              </div>
              {customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} timeZone={props.data.timezone} />
              ))}
            </div>
            <p className="admin-footnote">
              Los teléfonos no están verificados. Evita ingresar datos de personas reales.
            </p>
          </>
        )}

        {page === "money" && (
          <>
            <PageHeading
              kicker="REGISTRO DEMOSTRATIVO"
              title="Movimientos"
              subtitle="Atenciones y movimientos de dinero tienen registros independientes."
            />
            <section className="admin-service-visits">
              <div className="admin-section-title">
                <div>
                  <h2>Servicios efectuados</h2>
                  <p>Importes por atención y fecha. No se suman a cobros ni a devoluciones.</p>
                </div>
              </div>
              {props.data.visits.length ? (
                props.data.visits
                  .slice()
                  .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                  .map((visit) => (
                    <article className="admin-visit-record" key={visit.id}>
                      <div className="admin-visit-record-heading">
                        <div>
                          <strong>{visit.customerName}</strong>
                          <small>{dateTimeLabel(visit.completedAt, props.data.timezone)}</small>
                        </div>
                        <strong>{money(visit.totalCents)}</strong>
                      </div>
                      <div className="admin-visit-record-items">
                        {visit.items.map((item, index) => (
                          <span key={`${item.name}-${index}`}>
                            {item.name}{" "}
                            <small>
                              {item.durationMinutes} min · {money(item.priceCents)}
                            </small>
                          </span>
                        ))}
                      </div>
                    </article>
                  ))
              ) : (
                <Empty
                  title="Sin atenciones registradas"
                  copy="Las atenciones completadas aparecerán aquí con sus servicios e importes."
                />
              )}
            </section>
            <div className="admin-money-summary">
              <div>
                <small>Entradas registradas</small>
                <strong>{money(props.data.summary.collectedCents)}</strong>
              </div>
              <div>
                <small>Devoluciones registradas</small>
                <strong>{money(props.data.summary.refundedCents)}</strong>
              </div>
              <div className="admin-money-actions">
                <button
                  className="admin-button admin-button-outline"
                  disabled={busy}
                  onClick={() => openFor("sale")}
                >
                  Registrar venta
                </button>
                <button
                  className="admin-button admin-button-primary"
                  disabled={busy || !props.data.movements.some((item) => item.canRefund)}
                  onClick={() => {
                    setSelectedMovement(
                      props.data.movements.find((item) => item.canRefund)?.id ?? "",
                    );
                    openFor("refund");
                  }}
                >
                  Registrar devolución
                </button>
              </div>
            </div>
            <h2 className="admin-movement-heading">Cobros, ventas y devoluciones</h2>
            <div className="admin-movement-list">
              {props.data.movements.length ? (
                props.data.movements.map((movement) => (
                  <div className="admin-movement" key={movement.id}>
                    <span className={`admin-movement-mark kind-${movement.kind}`}>
                      {movement.kind === "refund" ? "−" : "+"}
                    </span>
                    <div>
                      <strong>{movement.description}</strong>
                      <small>
                        {movement.customerName ?? "Sin cliente"} ·{" "}
                        {dateTimeLabel(movement.createdAt, props.data.timezone)}{" "}
                        {movement.method ? `· ${movement.method}` : ""}
                      </small>
                    </div>
                    <strong className={movement.kind === "refund" ? "negative" : ""}>
                      {movement.kind === "refund" ? "−" : "+"}
                      {money(movement.amountCents)}
                    </strong>
                  </div>
                ))
              ) : (
                <Empty title="Sin movimientos" copy="Todavía no hay movimientos para mostrar." />
              )}
            </div>
            <div className="admin-accounting-note">
              Un anticipo ya registrado no se vuelve a contar al completar una atención. Las cifras
              no se concilian con el banco.
            </div>
          </>
        )}

        {page === "settings" && (
          <>
            <PageHeading
              kicker="ASÍ FUNCIONA TU ESTUDIO"
              title="Ajustes"
              subtitle="Edita el catálogo y el horario de demostración."
            />
            <section className="admin-settings-section">
              <div className="admin-section-title">
                <div>
                  <h2>Servicios</h2>
                  <p>
                    El precio y la duración de una reserva pasada no cambian al editar el catálogo.
                  </p>
                </div>
                <button
                  className="admin-button admin-button-outline"
                  disabled={busy || Boolean(props.unavailableActions?.saveService)}
                  title={props.unavailableActions?.saveService}
                  onClick={() => {
                    setSelectedService(null);
                    openFor("service");
                  }}
                >
                  <Icon name="plus" /> Añadir servicio
                </button>
              </div>
              {props.data.services.map((service) => (
                <div className="admin-service-row" key={service.id}>
                  <span className="admin-service-icon">
                    <Icon name="scissors" />
                  </span>
                  <div>
                    <strong>{service.name}</strong>
                    <small>
                      {service.durationMinutes} min{" "}
                      {service.requiresConsultation ? "· Requiere consulta" : ""}
                    </small>
                  </div>
                  <strong>{money(service.priceCents)}</strong>
                  <span className={`admin-status ${service.active ? "is-confirmed" : ""}`}>
                    {service.active ? "Activo" : "Inactivo"}
                  </span>
                  <button
                    className="admin-button admin-button-quiet"
                    disabled={busy || Boolean(props.unavailableActions?.saveService)}
                    title={props.unavailableActions?.saveService}
                    onClick={() => {
                      setSelectedService(service.id);
                      openFor("service");
                    }}
                  >
                    Editar
                  </button>
                </div>
              ))}
              {props.unavailableActions?.saveService && (
                <p className="admin-footnote">{props.unavailableActions.saveService}</p>
              )}
            </section>
            <section className="admin-settings-section">
              <div className="admin-section-title">
                <div>
                  <h2>Horario y excepciones</h2>
                  <p>
                    Zona horaria del negocio: {props.data.timezone}. Los horarios siguientes son
                    informativos.
                  </p>
                </div>
                <button
                  className="admin-button admin-button-outline"
                  disabled={busy}
                  onClick={() => openFor("schedule")}
                >
                  Editar horario
                </button>
              </div>
              {props.data.schedule.map((day) => (
                <div className="admin-schedule-row" key={day.weekday}>
                  <span>
                    {
                      ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][
                        day.weekday
                      ]
                    }
                  </span>
                  <strong>{day.enabled ? `${day.opensAt} – ${day.closesAt}` : "Cerrado"}</strong>
                  {day.breakStartsAt && (
                    <small>
                      Pausa {day.breakStartsAt}–{day.breakEndsAt}
                    </small>
                  )}
                </div>
              ))}
              {props.data.exceptions.map((exception) => (
                <div className="admin-exception-row" key={exception.id}>
                  <strong>{dateLabel(exception.date)}</strong>
                  <span>{exception.label}</span>
                  <small>
                    {exception.closed ? "Cerrado" : `${exception.opensAt}–${exception.closesAt}`}
                  </small>
                </div>
              ))}
            </section>
            <section className="admin-policy-panel">
              <div>
                <p className="admin-kicker">POLÍTICAS DE REFERENCIA</p>
                <h2>Condiciones del estudio</h2>
              </div>
              <ul>
                <li>
                  <strong>Reprogramación gratuita</strong>
                  <span>Con al menos 2 horas de anticipación.</span>
                </li>
                <li>
                  <strong>Cancelación tardía o inasistencia</strong>
                  <span>Puede aplicar un cargo adicional del 70 %.</span>
                </li>
                <li>
                  <strong>Tolerancia</strong>
                  <span>5 minutos desde la hora de la cita.</span>
                </li>
                <li>
                  <strong>Cancelación por barbería</strong>
                  <span>Conserva el crédito para usarlo más adelante.</span>
                </li>
                <li>
                  <strong>Devoluciones</strong>
                  <span>Se revisan y procesan manualmente.</span>
                </li>
              </ul>
              <p className="admin-policy-note">
                Estas reglas son informativas en el demo. No se hacen cargos ni devoluciones
                automáticamente; cualquier devolución se gestiona fuera de la aplicación.
              </p>
            </section>
            <section className="admin-danger-zone">
              <div>
                <h2>Restablecer datos de demo</h2>
                <p>
                  Elimina los cambios locales y recupera el conjunto inicial ficticio. No se puede
                  deshacer.
                </p>
              </div>
              <button
                className="admin-button admin-button-danger"
                disabled={busy}
                onClick={() => openFor("restore")}
              >
                Restablecer datos
              </button>
            </section>
          </>
        )}
      </main>

      {dialog && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button className="admin-modal-close" aria-label="Cerrar" onClick={closeDialog}>
              ×
            </button>
            {formError && (
              <p className="admin-message is-error" role="alert">
                {formError}
              </p>
            )}
            {dialog === "booking" && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) => {
                    const draft: BookingDraft = {
                      customerName: formText(form.get("name")),
                      customerPhone: formText(form.get("phone")),
                      startsAt: formText(form.get("startsAt")),
                      serviceIds: form.getAll("service").map(String),
                      note: formText(form.get("note")),
                    };
                    const price = form.get("price");
                    const duration = form.get("duration");
                    if (price) draft.agreedPriceCents = Math.round(Number(price) * 100);
                    if (duration) draft.agreedDurationMinutes = Number(duration);
                    props.onCreatePhoneBooking(draft);
                  })
                }
              >
                <ModalTitle
                  title="Reserva telefónica"
                  subtitle="Indica el horario solicitado; se revisará antes de guardarlo."
                />
                <TextField label="Nombre ficticio" name="name" required />
                <TextField label="Teléfono de prueba" name="phone" required />
                <TextField
                  label={`Fecha y hora solicitadas (${props.data.timezone})`}
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={businessDateTimeInput(undefined, props.data.timezone)}
                  required
                />
                <ServiceOptions services={props.data.services} />
                <div className="admin-field-grid">
                  <TextField
                    label="Precio acordado (Bs), si requiere consulta"
                    name="price"
                    type="number"
                    min="0"
                  />
                  <TextField
                    label="Duración acordada (min)"
                    name="duration"
                    type="number"
                    min="1"
                  />
                </div>
                <TextField label="Nota (opcional)" name="note" />
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "reschedule" && selectedBooking && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) => {
                    const draft: RescheduleDraft = {
                      bookingId: selectedBooking.id,
                      startsAt: formText(form.get("startsAt")),
                      reason: formText(form.get("reason")),
                    };
                    props.onRescheduleBooking(draft);
                  })
                }
              >
                <ModalTitle
                  title="Reprogramar cita"
                  subtitle={`${selectedBooking.customerName} · ${selectedBooking.code}`}
                />
                <TextField
                  label={`Nueva fecha y hora solicitadas (${props.data.timezone})`}
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={businessDateTimeInput(
                    selectedBooking.startsAt,
                    props.data.timezone,
                  )}
                  required
                />
                <TextField label="Motivo (opcional)" name="reason" />
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "walkin" && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) =>
                    props.onCreateWalkIn({
                      customerName: formText(form.get("name")),
                      customerPhone: formText(form.get("phone")),
                      serviceIds: form.getAll("service").map(String),
                      note: formText(form.get("note")),
                      paymentCents: form.get("payment")
                        ? Math.round(Number(form.get("payment")) * 100)
                        : undefined,
                      paymentMethod: formText(form.get("method")),
                    }),
                  )
                }
              >
                <ModalTitle
                  title="Registrar walk-in"
                  subtitle="Se guardará una ficha ficticia del cliente y la atención sin cita."
                />
                <TextField label="Nombre ficticio" name="name" required />
                <TextField label="Teléfono ficticio" name="phone" required />
                <ServiceOptions services={props.data.services} />
                <TextField label="Nota para el cliente (opcional)" name="note" />
                <div className="admin-field-grid">
                  <TextField
                    label="Cobro anotado (Bs, opcional)"
                    name="payment"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <label className="admin-field">
                    <span>Método de pago</span>
                    <select name="method" defaultValue="CASH">
                      <option value="CASH">Efectivo</option>
                      <option value="BANK_TRANSFER">Transferencia</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </label>
                </div>
                <p className="admin-footnote">
                  El cobro es un registro separado de la atención; no se verifica con el banco.
                </p>
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "visit" && selectedBooking && (
              <VisitForm
                booking={selectedBooking}
                services={props.data.services}
                busy={busy}
                onCancel={closeDialog}
                onSubmit={(draft) => {
                  props.onCompleteVisit(draft);
                  closeDialog();
                }}
              />
            )}
            {dialog === "sale" && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) =>
                    props.onRecordSale({
                      description: formText(form.get("description")),
                      quantity: Number(form.get("quantity")),
                      amountCents: Math.round(Number(form.get("amount")) * 100),
                      paymentMethod: formText(form.get("method")),
                    }),
                  )
                }
              >
                <ModalTitle
                  title="Registrar venta"
                  subtitle="Registro local de una venta simple; no administra inventario."
                />
                <TextField label="Descripción" name="description" required />
                <div className="admin-field-grid">
                  <TextField
                    label="Cantidad"
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    required
                  />
                  <TextField
                    label="Total (Bs)"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <TextField
                  label="Método registrado"
                  name="method"
                  placeholder="Efectivo, transferencia…"
                />
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "refund" && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) =>
                    props.onRecordRefund({
                      movementId: formText(form.get("movementId")),
                      amountCents: Math.round(Number(form.get("amount")) * 100),
                      reason: formText(form.get("reason")),
                    }),
                  )
                }
              >
                <ModalTitle
                  title="Anotar devolución"
                  subtitle="Esto solo registra una salida simulada; no envía dinero."
                />
                <label className="admin-field">
                  <span>Pago verificado</span>
                  <select name="movementId" defaultValue={selectedMovement} required>
                    {props.data.movements
                      .filter((item) => item.canRefund)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.customerName ?? "Sin cliente"} ·{" "}
                          {dateTimeLabel(item.createdAt, props.data.timezone)} · Disponible{" "}
                          {money(item.refundableCents ?? item.amountCents)}
                        </option>
                      ))}
                  </select>
                </label>
                <TextField
                  label="Importe (Bs)"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
                <TextField label="Motivo" name="reason" required />
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "service" && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) =>
                    props.onSaveService({
                      id: selectedService ?? undefined,
                      name: formText(form.get("name")),
                      priceCents: Math.round(Number(form.get("price")) * 100),
                      durationMinutes: Number(form.get("duration")),
                      active: form.get("active") === "on",
                      requiresConsultation: form.get("consult") === "on",
                    }),
                  )
                }
              >
                <ModalTitle
                  title={selectedService ? "Editar servicio" : "Añadir servicio"}
                  subtitle="Los cambios se aplicarán cuando se guarden."
                />
                <TextField
                  label="Nombre"
                  name="name"
                  required
                  defaultValue={
                    props.data.services.find((item) => item.id === selectedService)?.name
                  }
                />
                <div className="admin-field-grid">
                  <TextField
                    label="Precio (Bs; 0 si requiere consulta)"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={
                      props.data.services.find((item) => item.id === selectedService)
                        ? String(
                            (props.data.services.find((item) => item.id === selectedService)
                              ?.priceCents ?? 0) / 100,
                          )
                        : undefined
                    }
                  />
                  <TextField
                    label="Duración en minutos (0 si requiere consulta)"
                    name="duration"
                    type="number"
                    min="0"
                    defaultValue={String(
                      props.data.services.find((item) => item.id === selectedService)
                        ?.durationMinutes ?? "",
                    )}
                  />
                </div>
                <CheckField
                  name="active"
                  label="Disponible en el catálogo"
                  defaultChecked={
                    selectedService
                      ? props.data.services.find((item) => item.id === selectedService)?.active
                      : true
                  }
                />
                <CheckField
                  name="consult"
                  label="Requiere consulta previa"
                  defaultChecked={
                    props.data.services.find((item) => item.id === selectedService)
                      ?.requiresConsultation
                  }
                />
                <p className="admin-footnote">
                  Los servicios reservables necesitan precio y duración mayores que cero. Los de
                  consulta pueden dejar ambos valores en cero para acordarlos por teléfono.
                </p>
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "schedule" && (
              <form
                onSubmit={(event) =>
                  submit(event, (form) => {
                    const schedule = props.data.schedule.map((day) => {
                      const prefix = `day-${day.weekday}-`;
                      return {
                        weekday: day.weekday,
                        enabled: form.get(`${prefix}enabled`) === "on",
                        opensAt: formText(form.get(`${prefix}opens`)) || day.opensAt,
                        closesAt: formText(form.get(`${prefix}closes`)) || day.closesAt,
                        breakStartsAt: formText(form.get(`${prefix}breakStart`)) || undefined,
                        breakEndsAt: formText(form.get(`${prefix}breakEnd`)) || undefined,
                      };
                    });
                    const exceptions = props.data.exceptions.map((item) => {
                      const prefix = `exception-${item.id}-`;
                      return {
                        ...item,
                        date: formText(form.get(`${prefix}date`)) || item.date,
                        label: item.label,
                        closed: form.get(`${prefix}closed`) === "on",
                        opensAt: formText(form.get(`${prefix}opens`)) || undefined,
                        closesAt: formText(form.get(`${prefix}closes`)) || undefined,
                      };
                    });
                    const exceptionDate = formText(form.get("exceptionDate"));
                    const newClosed = form.get("exceptionClosed") === "on";
                    const newOpens = formText(form.get("exceptionOpens")) || undefined;
                    const newCloses = formText(form.get("exceptionCloses")) || undefined;
                    if (exceptionDate && !newClosed && (!newOpens || !newCloses))
                      throw new Error(
                        "Para una excepción abierta, indica hora de apertura y cierre.",
                      );
                    if (exceptionDate)
                      exceptions.push({
                        id: `new:${exceptionDate}`,
                        date: exceptionDate,
                        label: "Excepción",
                        closed: newClosed,
                        opensAt: newOpens,
                        closesAt: newCloses,
                      });
                    props.onSaveSchedule({ schedule, exceptions });
                  })
                }
              >
                <ModalTitle
                  title="Horario y excepciones"
                  subtitle="Propón los cambios de horario y excepciones para este negocio."
                />
                <div className="admin-schedule-editor">
                  {props.data.schedule.map((day) => (
                    <fieldset className="admin-day-editor" key={day.weekday}>
                      <legend>
                        {
                          [
                            "Domingo",
                            "Lunes",
                            "Martes",
                            "Miércoles",
                            "Jueves",
                            "Viernes",
                            "Sábado",
                          ][day.weekday]
                        }
                      </legend>
                      <CheckField
                        name={`day-${day.weekday}-enabled`}
                        label="Abierto"
                        defaultChecked={day.enabled}
                      />
                      <div className="admin-field-grid">
                        <TextField
                          label="Apertura"
                          name={`day-${day.weekday}-opens`}
                          type="time"
                          defaultValue={day.opensAt}
                        />
                        <TextField
                          label="Cierre"
                          name={`day-${day.weekday}-closes`}
                          type="time"
                          defaultValue={day.closesAt}
                        />
                      </div>
                      <div className="admin-field-grid">
                        <TextField
                          label="Inicio pausa"
                          name={`day-${day.weekday}-breakStart`}
                          type="time"
                          defaultValue={day.breakStartsAt}
                        />
                        <TextField
                          label="Fin pausa"
                          name={`day-${day.weekday}-breakEnd`}
                          type="time"
                          defaultValue={day.breakEndsAt}
                        />
                      </div>
                    </fieldset>
                  ))}
                </div>
                {props.data.exceptions.length > 0 && (
                  <>
                    <h3 className="admin-modal-subheading">Excepciones existentes</h3>
                    {props.data.exceptions.map((exception) => (
                      <fieldset className="admin-day-editor" key={exception.id}>
                        <legend>{exception.label}</legend>
                        <TextField
                          label="Fecha"
                          name={`exception-${exception.id}-date`}
                          type="date"
                          defaultValue={exception.date}
                        />
                        <CheckField
                          name={`exception-${exception.id}-closed`}
                          label="Cerrado todo el día"
                          defaultChecked={exception.closed}
                        />
                        <div className="admin-field-grid">
                          <TextField
                            label="Apertura especial"
                            name={`exception-${exception.id}-opens`}
                            type="time"
                            defaultValue={exception.opensAt}
                          />
                          <TextField
                            label="Cierre especial"
                            name={`exception-${exception.id}-closes`}
                            type="time"
                            defaultValue={exception.closesAt}
                          />
                        </div>
                      </fieldset>
                    ))}
                  </>
                )}
                <h3 className="admin-modal-subheading">Añadir excepción</h3>
                <div className="admin-field-grid">
                  <TextField label="Fecha" name="exceptionDate" type="date" />
                </div>
                <CheckField
                  name="exceptionClosed"
                  label="Cerrado todo el día"
                  defaultChecked={false}
                />
                <div className="admin-field-grid">
                  <TextField label="Apertura especial" name="exceptionOpens" type="time" />
                  <TextField label="Cierre especial" name="exceptionCloses" type="time" />
                </div>
                <FormActions busy={busy} onCancel={closeDialog} />
              </form>
            )}
            {dialog === "restore" && (
              <div>
                <ModalTitle
                  title="¿Restablecer el demo?"
                  subtitle="Esta acción eliminará tus cambios locales y volverá a los datos iniciales ficticios."
                />
                <div className="admin-warning">
                  <strong>Confirma antes de continuar</strong>
                  <span>
                    No afecta a otros navegadores. Si el almacenamiento falla, verás un aviso y
                    podrás volver a intentarlo.
                  </span>
                </div>
                {!confirmRestore ? (
                  <div className="admin-form-actions">
                    <button className="admin-button admin-button-quiet" onClick={closeDialog}>
                      Conservar cambios
                    </button>
                    <button
                      className="admin-button admin-button-danger"
                      onClick={() => setConfirmRestore(true)}
                    >
                      Continuar
                    </button>
                  </div>
                ) : (
                  <div className="admin-form-actions">
                    <button className="admin-button admin-button-quiet" onClick={closeDialog}>
                      Cancelar
                    </button>
                    <button
                      className="admin-button admin-button-danger"
                      disabled={busy}
                      onClick={() => {
                        props.onRestoreDemoData();
                        closeDialog();
                      }}
                    >
                      Sí, restablecer datos
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      <nav className="admin-bottom-nav" aria-label="Navegación móvil">
        {nav.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? "is-active" : ""}
            onClick={() => setPage(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className={`admin-stat ${accent ? "is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function PageHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        <p className="admin-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="admin-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}
function BookingRow({
  booking,
  timeZone,
  onClick,
}: {
  booking: AdminBooking;
  timeZone: string;
  onClick: () => void;
}) {
  return (
    <button className="admin-booking-row" onClick={onClick}>
      <span className="admin-booking-time">
        {timeLabel(booking.startsAt, timeZone)}
        <small>{timeLabel(booking.endsAt, timeZone)}</small>
      </span>
      <span className={`admin-booking-line status-${booking.status.toLowerCase()}`} />
      <span className="admin-booking-main">
        <strong>{booking.customerName}</strong>
        <small>{booking.items.map((item) => item.name).join(" + ") || "Atención"}</small>
      </span>
      <span className="admin-booking-aside">
        <span
          className={`admin-status ${booking.status === "CONFIRMED" ? "is-confirmed" : "is-pending"}`}
        >
          {statusLabels[booking.status]}
        </span>
        <small>
          {booking.source === "web-demo"
            ? "Solicitud web"
            : booking.source === "phone"
              ? "Teléfono"
              : "Walk-in"}{" "}
          · {money(booking.totalCents)}
        </small>
      </span>
      <span className="admin-row-chevron">›</span>
    </button>
  );
}
function EventHistory({ events, timeZone }: { events: AdminBookingEvent[]; timeZone: string }) {
  const actionLabels: Record<string, string> = {
    CREATED: "Solicitud creada",
    CREATED_BY_PHONE: "Reserva telefónica creada",
    PAYMENT_DECLARED: "Pago declarado en el demo",
    APPROVED: "Solicitud aprobada en el demo",
    REJECTED_AND_RELEASED: "Solicitud rechazada",
    RELEASED: "Horario liberado",
    CANCELLED: "Reserva cancelada",
    NO_SHOW: "Inasistencia registrada",
    RESCHEDULED: "Reserva reprogramada",
    COMPLETED: "Atención registrada",
  };
  return (
    <div className="admin-event-history">
      {events.length ? (
        events
          .slice()
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .map((item) => (
            <article className="admin-event" key={item.id}>
              <span className="admin-event-dot" />
              <div>
                <strong>{actionLabels[item.action] ?? item.action.replaceAll("_", " ")}</strong>
                <small>
                  {dateTimeLabel(item.occurredAt, timeZone)} · {item.actor.toLocaleLowerCase("es")}
                </small>
                {item.reason && <p>Motivo: {item.reason}</p>}
                {typeof item.changes?.from === "string" &&
                  typeof item.changes.to === "string" &&
                  Number.isFinite(Date.parse(item.changes.from)) &&
                  Number.isFinite(Date.parse(item.changes.to)) && (
                    <p>
                      De {dateTimeLabel(item.changes.from, timeZone)} a{" "}
                      {dateTimeLabel(item.changes.to, timeZone)}
                    </p>
                  )}
              </div>
            </article>
          ))
      ) : (
        <p className="admin-footnote">No hay eventos registrados todavía.</p>
      )}
    </div>
  );
}
function BookingDetail({
  booking,
  timeZone,
  busy,
  close,
  actions,
}: {
  booking: AdminBooking;
  timeZone: string;
  busy: boolean;
  close: () => void;
  actions: { reschedule: () => void; cancel: () => void; noShow: () => void; visit: () => void };
}) {
  const canCancel = ["AWAITING_PAYMENT_NOTICE", "PENDING_VERIFICATION", "CONFIRMED"].includes(
    booking.status,
  );
  const canReschedule = ["CONFIRMED", "PENDING_VERIFICATION"].includes(booking.status);
  return (
    <div
      className="admin-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className="admin-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-detail-title"
      >
        <button className="admin-modal-close" aria-label="Cerrar detalle" onClick={close}>
          ×
        </button>
        <p className="admin-kicker">{booking.code}</p>
        <h2 id="booking-detail-title">{booking.customerName}</h2>
        <p className="admin-subtitle">
          {dateTimeLabel(booking.startsAt, timeZone)} · {booking.customerPhone}
        </p>
        <span className="admin-status is-confirmed">{statusLabels[booking.status]}</span>
        <h3>{booking.isVisit ? "Servicios realizados" : "Servicios reservados"}</h3>
        {booking.items.map((item, index) => (
          <div className="admin-detail-item" key={`${item.name}-${index}`}>
            <span>
              {item.name}
              <small>{item.durationMinutes} min</small>
            </span>
            <strong>{money(item.priceCents)}</strong>
          </div>
        ))}
        <div className="admin-detail-total">
          <span>{booking.isVisit ? "Total de atención" : "Total de reserva"}</span>
          <strong>{money(booking.totalCents)}</strong>
        </div>
        <p className="admin-detail-note">
          Precio y duración mostrados son la fotografía al reservar. Los movimientos de pago tienen
          un registro separado.
        </p>
        {!booking.isVisit && (
          <>
            <h3>Historial de la reserva</h3>
            <EventHistory events={booking.events ?? []} timeZone={timeZone} />
          </>
        )}
        <div className="admin-detail-actions">
          <button
            className="admin-button admin-button-primary"
            disabled={busy || booking.isVisit || booking.status !== "CONFIRMED"}
            onClick={actions.visit}
          >
            Registrar atención
          </button>
          <button
            className="admin-button admin-button-outline"
            disabled={busy || booking.isVisit || !canReschedule}
            onClick={actions.reschedule}
          >
            Reprogramar
          </button>
          <button
            className="admin-button admin-button-quiet"
            disabled={busy || booking.isVisit || booking.status !== "CONFIRMED"}
            onClick={actions.noShow}
          >
            Marcar no asistió
          </button>
          <button
            className="admin-button admin-button-danger"
            disabled={busy || booking.isVisit || !canCancel}
            onClick={actions.cancel}
          >
            Cancelar cita
          </button>
        </div>
      </aside>
    </div>
  );
}
function CustomerRow({ customer, timeZone }: { customer: AdminCustomer; timeZone: string }) {
  return (
    <details className="admin-customer-row">
      <summary>
        <span className="admin-customer-name">
          <span className="admin-customer-avatar">
            {customer.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <strong>{customer.name}</strong>
        </span>
        <span>{customer.phone}</span>
        <span>{customer.bookingCount}</span>
        <span>
          {customer.lastVisitAt
            ? dateLabel(businessDateKey(new Date(customer.lastVisitAt), timeZone))
            : "Sin visitas"}
        </span>
      </summary>
      <div className="admin-customer-history">
        <strong>Ficha de demostración</strong>
        <p>
          {customer.note || "Sin nota registrada."} {customer.email ? `· ${customer.email}` : ""}
        </p>
        {customer.musicLink && (
          <p>
            Enlace musical:{" "}
            <a href={customer.musicLink} target="_blank" rel="noreferrer">
              {customer.musicLink}
            </a>
          </p>
        )}
        <strong>Historial</strong>
        <EventHistory events={customer.events ?? []} timeZone={timeZone} />
        <small>Datos de contacto ficticios, no verificados.</small>
      </div>
    </details>
  );
}
function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="admin-empty">
      <span>
        <Icon name="inbox" />
      </span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}
function ModalTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="admin-modal-heading">
      <p className="admin-kicker">ACCIÓN DE DEMOSTRACIÓN</p>
      <h2 id="dialog-title">{title}</h2>
      <p>{subtitle}</p>
    </header>
  );
}
function TextField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  min,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={min}
        step={step}
        placeholder={placeholder}
      />
    </label>
  );
}
function CheckField({
  name,
  label,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="admin-check">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  );
}
function ServiceOptions({ services }: { services: AdminAppProps["data"]["services"] }) {
  return (
    <fieldset className="admin-service-options">
      <legend>Servicios solicitados</legend>
      {services
        .filter((service) => service.active)
        .map((service) => (
          <label key={service.id}>
            <input type="checkbox" name="service" value={service.id} />
            <span>
              {service.name}
              <small>
                {service.durationMinutes} min · {money(service.priceCents)}
                {service.requiresConsultation ? " · Consulta" : ""}
              </small>
            </span>
          </label>
        ))}
      {services.every((service) => !service.active) && (
        <small>No hay servicios activos. Añade servicios en Ajustes.</small>
      )}
    </fieldset>
  );
}
function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="admin-form-actions">
      <button type="button" className="admin-button admin-button-quiet" onClick={onCancel}>
        Cancelar
      </button>
      <button type="submit" className="admin-button admin-button-primary" disabled={busy}>
        Enviar al demo
      </button>
    </div>
  );
}
function VisitForm({
  booking,
  services,
  busy,
  onCancel,
  onSubmit,
}: {
  booking: AdminBooking;
  services: AdminAppProps["data"]["services"];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: VisitDraft) => void;
}) {
  const [extras, setExtras] = useState<
    Array<{ serviceId: string; name: string; priceCents: number; durationMinutes: number }>
  >([]);
  const base = booking.items.map((item) => ({
    name: item.name,
    priceCents: item.priceCents,
    serviceId: item.serviceId,
    durationMinutes: item.durationMinutes,
  }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({
          bookingId: booking.id,
          customerName: booking.customerName,
          customerId: booking.customerId,
          items: [...base, ...extras],
          paymentCents: form.get("payment")
            ? Math.round(Number(form.get("payment")) * 100)
            : undefined,
          paymentMethod: formText(form.get("method")),
        });
      }}
    >
      <ModalTitle
        title="Registrar atención"
        subtitle={`${booking.customerName} · añade solo lo que se realizó realmente.`}
      />
      <div className="admin-visit-base">
        <strong>Reservado</strong>
        {base.map((item, index) => (
          <span key={index}>
            {item.name} · {money(item.priceCents)}
          </span>
        ))}
      </div>
      <label className="admin-field">
        <span>Añadir servicio realizado</span>
        <select
          value=""
          onChange={(event) => {
            const service = services.find((item) => item.id === event.target.value);
            if (service)
              setExtras((current) => [
                ...current,
                {
                  serviceId: service.id,
                  name: service.name,
                  priceCents: service.priceCents,
                  durationMinutes: service.durationMinutes,
                },
              ]);
          }}
        >
          <option value="">Seleccionar servicio</option>
          {services
            .filter((item) => item.active)
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {money(item.priceCents)}
              </option>
            ))}
        </select>
      </label>
      {extras.map((extra, index) => (
        <div className="admin-extra-item" key={`${extra.serviceId}-${index}`}>
          {extra.name} · {money(extra.priceCents)}
          <button
            type="button"
            aria-label={`Quitar ${extra.name}`}
            onClick={() =>
              setExtras((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            ×
          </button>
        </div>
      ))}
      <div className="admin-field-grid">
        <TextField
          label="Cobro adicional recibido en local (Bs, opcional)"
          name="payment"
          type="number"
          min="0"
          step="0.01"
        />
        <label className="admin-field">
          <span>Método de pago</span>
          <select name="method" defaultValue="CASH">
            <option value="CASH">Efectivo</option>
            <option value="BANK_TRANSFER">Transferencia</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
      </div>
      <p className="admin-footnote">
        El anticipo existente no se registra de nuevo. Deja el importe vacío si no se recibió un
        pago adicional en local.
      </p>
      <FormActions busy={busy} onCancel={onCancel} />
    </form>
  );
}
