import { useEffect, useMemo, useState, type FormEvent } from "react";
import "./public-app.css";

export type PublicService = {
  id: string;
  name: string;
  price: number;
  duration: number;
  requiresConsultation: boolean;
};

export type PublicBarber = {
  id: string;
  name: string;
};

export const ANY_AVAILABLE_BARBER = "any";

/** `date` is a business-calendar date (YYYY-MM-DD); `startsAt` is an absolute ISO instant. */
export type PublicSlot = {
  startsAt: string;
  label: string;
  barberId: string;
  barberName: string;
};

export type PublicBookingItem = {
  id: string;
  name: string;
  price: number;
  duration: number;
};

export type PublicBooking = {
  id: string;
  code: string;
  expiresAt: string;
  items: PublicBookingItem[];
  amount: number;
  startsAt: string;
  /** Business-facing label retained from the selected slot. */
  startLabel: string;
};

export type PublicCustomer = {
  name: string;
  phone: string;
  email?: string;
  preferences: {
    notes?: string;
    musicLink?: string;
  };
};

export type DeclarePaymentResult = { success: true } | { success: false; message: string };

export type PublicAppProps = {
  services: PublicService[];
  barbers: PublicBarber[];
  /** Returns slots for a date, selected direct-booking services, and barber selection. */
  getSlots: (
    date: string,
    serviceIds: string[],
    barberId: string,
  ) => PublicSlot[] | Promise<PublicSlot[]>;
  reserve: (input: {
    serviceIds: string[];
    date: string;
    slot: PublicSlot;
    customer: PublicCustomer;
  }) => PublicBooking | Promise<PublicBooking>;
  declarePayment: (bookingId: string) => DeclarePaymentResult | Promise<DeclarePaymentResult>;
  whatsapp: string;
  qrUrl: string;
  businessName?: string;
  timeZone: string;
  /** Optional visible payment instructions supplied by the adapter/business. */
  paymentInstructions?: string;
};

type Screen = "booking" | "payment" | "result";

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(amount);

function businessDateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function todayInTimeZone(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function googleCalendarUrl(booking: PublicBooking, businessName: string) {
  const start = new Date(booking.startsAt);
  const end = new Date(
    start.getTime() + booking.items.reduce((total, item) => total + item.duration, 0) * 60_000,
  );
  const stamp = (value: Date) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Solicitud pendiente · ${businessName}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Solicitud simulada ${booking.code}. No es una cita confirmada. Contacta al negocio por WhatsApp.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function whatsappUrl(number: string, message: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

export default function PublicApp({
  services,
  barbers,
  getSlots,
  reserve,
  declarePayment,
  whatsapp,
  qrUrl,
  businessName = "Boss Barber Shop by RF",
  timeZone,
  paymentInstructions,
}: PublicAppProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [date, setDate] = useState(() => todayInTimeZone(timeZone));
  const [selectedBarberId, setSelectedBarberId] = useState(ANY_AVAILABLE_BARBER);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsRefresh, setSlotsRefresh] = useState(0);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [customer, setCustomer] = useState<PublicCustomer>({
    name: "",
    phone: "",
    preferences: {},
  });
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [screen, setScreen] = useState<Screen>("booking");
  const [qrRevealed, setQrRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [declared, setDeclared] = useState(false);

  const selectedServices = useMemo(
    () =>
      services.filter(
        (service) => selectedIds.includes(service.id) && !service.requiresConsultation,
      ),
    [services, selectedIds],
  );
  const amount = selectedServices.reduce((total, service) => total + service.price, 0);

  useEffect(() => {
    let active = true;
    if (!date || selectedIds.length === 0) {
      setSlots([]);
      setSelectedSlot(null);
      return () => {
        active = false;
      };
    }
    setSlotsLoading(true);
    setSlotsError("");
    setSelectedSlot(null);
    Promise.resolve(getSlots(date, selectedIds, selectedBarberId))
      .then((nextSlots) => {
        if (active) setSlots(nextSlots);
      })
      .catch(() => {
        if (active) setSlotsError("No pudimos consultar los horarios. Intenta de nuevo.");
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, selectedIds, selectedBarberId, getSlots, slotsRefresh]);

  useEffect(() => {
    if (!booking || screen !== "payment") return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(booking.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [booking, screen]);

  const expired = secondsLeft === 0;
  const canContinue = selectedServices.length > 0 && selectedSlot !== null;
  const toggleService = (service: PublicService) => {
    if (service.requiresConsultation) return;
    setSelectedIds((current) =>
      current.includes(service.id)
        ? current.filter((id) => id !== service.id)
        : [...current, service.id],
    );
  };

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !canContinue) return;
    setBusy(true);
    setError("");
    try {
      const created = await reserve({
        serviceIds: selectedServices.map((service) => service.id),
        date,
        slot: selectedSlot,
        customer,
      });
      setBooking(created);
      setScreen("payment");
      setQrRevealed(false);
      setDeclared(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la solicitud. Prueba otro horario.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclare() {
    if (!booking || expired || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await declarePayment(booking.id);
      if (result.success) {
        setDeclared(true);
        setScreen("result");
      } else setError(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la declaración local.");
    } finally {
      setBusy(false);
    }
  }

  function returnToSchedule() {
    setScreen("booking");
    setBooking(null);
    setSelectedSlot(null);
    setSecondsLeft(null);
    setQrRevealed(false);
    setError("");
    setSlotsRefresh((current) => current + 1);
  }

  const contactMessage = booking
    ? `Hola, soy ${customer.name}. Dejé una solicitud simulada ${booking.code} para ${booking.items.map((item) => item.name).join(", ")} el ${booking.startLabel}. Importe mostrado: ${formatMoney(booking.amount)}. Adjuntaré el comprobante manualmente si corresponde.`
    : `Hola, quisiera consultar sobre ${services.find((service) => service.requiresConsultation)?.name ?? "un servicio"}.`;

  return (
    <main className="public-booking">
      <section className="pb-intro">
        <div className="pb-intro-copy">
          <p className="pb-intro-business">{businessName}</p>
          <p className="pb-kicker">Un buen corte empieza aquí</p>
          <h1>
            Reserva tu
            <br />
            <em>cita.</em>
          </h1>
          <p>Elige tus servicios y un horario para crear una solicitud de reserva.</p>
        </div>
        <div className="pb-intro-art" aria-hidden="true">
          <span>✦</span>
          <b>RF</b>
          <i>ROLY F · JHON R</i>
        </div>
      </section>

      <aside className="pb-demo-notice" role="note">
        <span className="pb-notice-icon" aria-hidden="true">
          i
        </span>
        <p>
          <strong>Esto es una demostración.</strong> La solicitud se simula en este navegador: no es
          una cita real, no llega automáticamente al propietario y no hay garantía de
          disponibilidad. Los datos que introduzcas se guardan en el almacenamiento local de este
          navegador; usa solo datos ficticios.
        </p>
      </aside>

      {screen === "booking" && (
        <form className="pb-layout" onSubmit={submitBooking}>
          <div className="pb-main-column">
            <section className="pb-section" aria-labelledby="pb-services-title">
              <div className="pb-section-heading">
                <span className="pb-step">01</span>
                <div>
                  <h2 id="pb-services-title">Elige tus servicios</h2>
                  <p>Puedes combinar varios para tu visita.</p>
                </div>
              </div>
              <div className="pb-services">
                {services.map((service) => {
                  const selected = selectedIds.includes(service.id);
                  const content = (
                    <>
                      <span className="pb-service-check" aria-hidden="true">
                        {selected ? "✓" : service.requiresConsultation ? "↗" : "+"}
                      </span>
                      <span className="pb-service-copy">
                        <strong>{service.name}</strong>
                        <small>
                          {service.requiresConsultation
                            ? "Requiere consulta previa"
                            : `Hasta ${service.duration} min`}
                        </small>
                      </span>
                      <span className="pb-service-price">
                        {service.requiresConsultation ? "Consultar" : formatMoney(service.price)}
                      </span>
                    </>
                  );
                  return service.requiresConsultation ? (
                    <a
                      key={service.id}
                      className="pb-service is-consult"
                      href={whatsappUrl(
                        whatsapp,
                        `Hola, quisiera consultar sobre ${service.name}.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      key={service.id}
                      type="button"
                      className={`pb-service${selected ? " is-selected" : ""}`}
                      onClick={() => toggleService(service)}
                      aria-pressed={selected}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
              {services.length === 0 && (
                <p className="pb-muted">No hay servicios disponibles para mostrar.</p>
              )}
              {services.some((service) => service.requiresConsultation) && (
                <p className="pb-inline-note">
                  Los servicios que requieren consulta no se pueden incluir en esta reserva directa.{" "}
                  <a href={whatsappUrl(whatsapp, contactMessage)}>Preguntar por WhatsApp</a> (se
                  abrirá un mensaje; no se envía automáticamente).
                </p>
              )}
            </section>

            <section className="pb-section" aria-labelledby="pb-slot-title">
              <div className="pb-section-heading">
                <span className="pb-step">02</span>
                <div>
                  <h2 id="pb-slot-title">Encuentra tu horario</h2>
                  <p>Horarios de demostración, sujetos a cambios.</p>
                </div>
              </div>
              <div className="pb-schedule-fields">
                <label className="pb-field pb-date-field">
                  <span>Fecha</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    disabled={selectedServices.length === 0}
                    aria-describedby="pb-date-hint"
                  />
                </label>
                <label className="pb-field pb-barber-field">
                  <span>Barbero</span>
                  <select
                    value={selectedBarberId}
                    onChange={(event) => setSelectedBarberId(event.target.value)}
                    disabled={selectedServices.length === 0}
                  >
                    <option value={ANY_AVAILABLE_BARBER}>Cualquiera que esté disponible</option>
                    {barbers.map((barber) => (
                      <option key={barber.id} value={barber.id}>
                        {barber.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="pb-field-hint" id="pb-date-hint">
                Selecciona servicios para consultar los horarios disponibles. Zona horaria del
                negocio: {timeZone}.
              </p>
              {slotsLoading && (
                <p className="pb-loading" role="status">
                  Buscando horarios…
                </p>
              )}
              {slotsError && (
                <p className="pb-error" role="alert">
                  {slotsError} Cambia la fecha para volver a consultar.
                </p>
              )}
              {!slotsLoading && date && !slotsError && selectedServices.length > 0 && (
                <div className="pb-slots" role="group" aria-label="Horarios disponibles">
                  {slots.map((slot) => (
                    <button
                      key={`${slot.startsAt}-${slot.barberId}`}
                      type="button"
                      className={`pb-slot${selectedSlot?.startsAt === slot.startsAt && selectedSlot.barberId === slot.barberId ? " is-selected" : ""}`}
                      aria-pressed={
                        selectedSlot?.startsAt === slot.startsAt &&
                        selectedSlot.barberId === slot.barberId
                      }
                      onClick={() => setSelectedSlot(slot)}
                    >
                      <span>{slot.label}</span>
                      <small>{slot.barberName}</small>
                    </button>
                  ))}
                  {slots.length === 0 && (
                    <p className="pb-muted">
                      No hay horarios para esta selección. Prueba otra fecha.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="pb-section" aria-labelledby="pb-details-title">
              <div className="pb-section-heading">
                <span className="pb-step">03</span>
                <div>
                  <h2 id="pb-details-title">Tus datos de prueba</h2>
                  <p>No introduzcas información sensible.</p>
                </div>
              </div>
              <div className="pb-form-fields">
                <label className="pb-field">
                  <span>Nombre</span>
                  <input
                    required
                    autoComplete="name"
                    maxLength={80}
                    value={customer.name}
                    onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
                    placeholder="Nombre ficticio"
                  />
                </label>
                <label className="pb-field">
                  <span>Teléfono</span>
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    value={customer.phone}
                    onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
                    placeholder="Número de prueba"
                  />
                </label>
                <label className="pb-field">
                  <span>
                    Correo <small>Opcional</small>
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={120}
                    value={customer.email ?? ""}
                    onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
                    placeholder="nombre@ejemplo.com"
                  />
                </label>
                <label className="pb-field">
                  <span>
                    Preferencias <small>Opcional</small>
                  </span>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={customer.preferences.notes ?? ""}
                    onChange={(event) =>
                      setCustomer({
                        ...customer,
                        preferences: { ...customer.preferences, notes: event.target.value },
                      })
                    }
                    placeholder="¿Algún detalle que debamos saber?"
                  />
                </label>
                <label className="pb-field pb-wide">
                  <span>
                    Playlist de música que te gustaría escuchar <small>Opcional</small>
                  </span>
                  <input
                    type="url"
                    maxLength={300}
                    value={customer.preferences.musicLink ?? ""}
                    onChange={(event) =>
                      setCustomer({
                        ...customer,
                        preferences: { ...customer.preferences, musicLink: event.target.value },
                      })
                    }
                    placeholder="https://…"
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="pb-summary" aria-label="Resumen de la solicitud">
            <div className="pb-summary-top">
              <span>Tu visita</span>
              <span className="pb-summary-mark" aria-hidden="true">
                ✳
              </span>
            </div>
            {selectedServices.length ? (
              <ul className="pb-summary-items">
                {selectedServices.map((service) => (
                  <li key={service.id}>
                    <span>
                      {service.name}
                      <small>Hasta {service.duration} min</small>
                    </span>
                    <strong>{formatMoney(service.price)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pb-muted">Selecciona uno o más servicios.</p>
            )}
            <div className="pb-summary-total">
              <span>Total de demostración</span>
              <strong>{formatMoney(amount)}</strong>
            </div>
            <p className="pb-summary-slot">
              {selectedSlot
                ? `${businessDateLabel(date)} · ${selectedSlot.label} · ${selectedSlot.barberName}`
                : "El horario aparecerá aquí"}
            </p>
            {error && (
              <p className="pb-error" role="alert">
                {error}
              </p>
            )}
            <button className="pb-primary" type="submit" disabled={!canContinue || busy}>
              {busy ? "Creando solicitud…" : "Continuar con la solicitud"}
            </button>
            <p className="pb-summary-disclaimer">
              Continuar no confirma una cita. El QR puede realizar una transferencia real.
            </p>
          </aside>
        </form>
      )}

      {screen === "payment" && booking && (
        <section className="pb-checkout" aria-labelledby="pb-payment-title">
          <button
            className="pb-back"
            type="button"
            onClick={() => {
              setScreen("booking");
              setQrRevealed(false);
            }}
          >
            ← Volver al formulario
          </button>
          <div className="pb-checkout-grid">
            <div className="pb-checkout-content">
              <p className="pb-kicker">Solicitud creada · {booking.code}</p>
              <h2 id="pb-payment-title">
                {qrRevealed ? (
                  "Pago por QR"
                ) : (
                  <>
                    Antes de mostrar
                    <br />
                    el código QR
                  </>
                )}
              </h2>
              <div
                className={`pb-timer${expired ? " is-expired" : ""}`}
                role="timer"
                aria-live="off"
              >
                <span>{expired ? "Tiempo agotado" : "Tiempo restante de esta solicitud"}</span>
                <strong>
                  {secondsLeft === null
                    ? "—:—"
                    : `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`}
                </strong>
              </div>
              {expired && (
                <div className="pb-expired-action">
                  <p className="pb-error" role="alert">
                    La solicitud venció según el reloj de este dispositivo. No transfieras para esta
                    solicitud. El horario no está garantizado; puedes consultar otra hora.
                  </p>
                  <button type="button" className="pb-secondary" onClick={returnToSchedule}>
                    Elegir otro horario
                  </button>
                </div>
              )}
              {!qrRevealed ? (
                <div className="pb-warning-panel" role="alert">
                  <span className="pb-warning-symbol" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <h3>La transferencia sería real</h3>
                    <p>
                      Este QR es real y puede mover dinero. Sin embargo, esta demostración no
                      registra tu cita en un servidor ni verifica el pago. La solicitud no está
                      confirmada y el propietario no la recibe automáticamente.
                    </p>
                    <p>
                      La imagen indica vigencia hasta el <strong>30/11/2026</strong>. Revisa su
                      vigencia con el negocio antes de usarla; la aplicación no puede verificarla
                      con el banco.
                    </p>
                    <p>
                      Continúa solo si el negocio te indicó usar este QR en una prueba controlada.
                      No transfieras dinero por accidente.
                    </p>
                    <button
                      type="button"
                      className="pb-primary"
                      disabled={expired}
                      onClick={() => setQrRevealed(true)}
                    >
                      Entiendo; mostrar el QR
                    </button>
                  </div>
                </div>
              ) : !expired ? (
                <div className="pb-payment-panel">
                  <div className="pb-qr-frame">
                    <img
                      src={qrUrl}
                      width="977"
                      height="1280"
                      alt="Código QR bancario real. Solo escanéalo si el negocio indicó usarlo en una prueba controlada."
                    />
                  </div>
                  <p className="pb-qr-warning">
                    QR real · una transferencia puede mover dinero real. Vigencia indicada:
                    30/11/2026; verifica con el negocio antes de usarlo.
                  </p>
                  {paymentInstructions && <p className="pb-instructions">{paymentInstructions}</p>}
                  <button
                    type="button"
                    className="pb-primary"
                    disabled={expired || busy}
                    onClick={handleDeclare}
                  >
                    {busy ? "Guardando declaración…" : "Ya pagué (declarar en esta demo)"}
                  </button>
                  <p className="pb-summary-disclaimer">
                    Este botón solo registra una declaración local. No verifica la transferencia ni
                    confirma la cita.
                  </p>
                  {error && (
                    <p className="pb-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <aside className="pb-order-card">
              <h3>Resumen</h3>
              <p>{booking.startLabel}</p>
              <p className="pb-order-code">{booking.code}</p>
              <ul>
                {booking.items.map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <strong>{formatMoney(item.price)}</strong>
                  </li>
                ))}
              </ul>
              <div className="pb-summary-total">
                <span>Total mostrado</span>
                <strong>{formatMoney(booking.amount)}</strong>
              </div>
              <small>Importe de demostración; la aplicación no verifica pagos.</small>
            </aside>
          </div>
        </section>
      )}

      {screen === "result" && booking && (
        <section className="pb-result" aria-labelledby="pb-result-title" aria-live="polite">
          <div className="pb-result-emblem" aria-hidden="true">
            ✓
          </div>
          <p className="pb-kicker">Reserva guardada (demo)</p>
          <h2 id="pb-result-title">
            Envía tu comprobante
            <br />
            <em>para confirmar tu reserva</em>
          </h2>
          <div className="pb-result-code">
            <span>Código de referencia local</span>
            <strong>{booking.code}</strong>
            <small>Demo (No está registrado en un servidor)</small>
          </div>
          <p className="pb-whatsapp-note" id="pb-whatsapp-details">
            Al abrir WhatsApp se preparará un mensaje con tu nombre, código, servicios, fecha, hora
            e importe. Revisa el destinatario: no se envía automáticamente. Adjunta el comprobante
            manualmente si corresponde. El dashboard de otro dispositivo no recibe esta solicitud.
          </p>
          <div className="pb-result-actions">
            <a
              className="pb-primary pb-link-button pb-whatsapp-button"
              href={whatsappUrl(whatsapp, contactMessage)}
              target="_blank"
              rel="noreferrer"
              aria-describedby="pb-whatsapp-details"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  fill="currentColor"
                  d="M20.52 3.48A11.84 11.84 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.14 1.6 5.94L0 24l6.32-1.66a11.8 11.8 0 0 0 5.72 1.46h.01C18.6 23.8 24 18.47 24 11.9c0-3.17-1.24-6.15-3.48-8.42zM12.05 21.78h-.01a9.8 9.8 0 0 1-4.99-1.36l-.36-.21-3.75.98 1-3.65-.24-.38a9.8 9.8 0 0 1-1.51-5.26c0-5.43 4.42-9.85 9.87-9.85a9.8 9.8 0 0 1 6.98 2.9 9.8 9.8 0 0 1 2.88 6.99c0 5.43-4.42 9.85-9.87 9.85zm5.42-7.38c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.8-1.49-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.52.08-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.77-.73 2.02-1.43.25-.7.25-1.3.17-1.43-.08-.12-.27-.2-.57-.35z"
                />
              </svg>
              Abrir WhatsApp
            </a>
            <a
              className="pb-secondary"
              href={googleCalendarUrl(booking, businessName)}
              target="_blank"
              rel="noreferrer"
            >
              Añadir recordatorio a mi calendario
            </a>
          </div>
          <button
            type="button"
            className="pb-text-button"
            onClick={() => {
              setScreen("booking");
              setSelectedIds([]);
              setSelectedSlot(null);
              setDate(todayInTimeZone(timeZone));
              setBooking(null);
              setQrRevealed(false);
              setDeclared(false);
            }}
          >
            Volver al catálogo
          </button>
          {declared && <span className="pb-sr-only">Declaración completada</span>}
        </section>
      )}

      <footer className="pb-footer">
        <span>{businessName} · Demo interactiva</span>
        <span>Sin servidor · Sin sincronización · Sin citas reales</span>
      </footer>
    </main>
  );
}
