import { useCallback, useEffect, useRef, useState } from "react";
import AdminContainer from "./AdminContainer";
import PublicApp, {
  ANY_AVAILABLE_BARBER,
  type PublicBooking,
  type PublicBarber,
  type PublicCustomer,
  type PublicSlot,
} from "./public-ui/PublicApp";
import { Shell } from "./Shell";
import { Button } from "./components/ui/button";
import { publicConfig } from "./config";
import {
  createBooking,
  createDemoSeed,
  declarePayment,
  getAvailableSlots,
  isBlockingBooking,
  localDateTime,
  reevaluateBookingExpirations,
  upsertCustomer,
  type DomainState,
} from "./domain";
import { createBrowserRepository, type LocalRepository } from "./repository";

type Startup = {
  repository: LocalRepository | null;
  state: DomainState | null;
  error: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrió un error al guardar los datos locales.";
}

function hasExpiredChanges(before: DomainState, after: DomainState) {
  return before.bookings.some((booking, index) => booking.status !== after.bookings[index]?.status);
}

function initialize(): Startup {
  let repository: LocalRepository | null = null;
  try {
    repository = createBrowserRepository();
    const loaded = repository.initialize(createDemoSeed());
    const current = reevaluateBookingExpirations(loaded, new Date().toISOString());
    if (hasExpiredChanges(loaded, current)) repository.save(current);
    return { repository, state: current, error: null };
  } catch (error) {
    return { repository, state: null, error: errorMessage(error) };
  }
}

function identifier(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function App() {
  const [startup] = useState(initialize);
  const repository = useRef(startup.repository);
  const stateRef = useRef(startup.state);
  const [state, setState] = useState(startup.state);
  const [storageError, setStorageError] = useState(startup.error);
  const [admin, setAdmin] = useState(() => window.location.hash.startsWith("#/admin"));

  useEffect(() => {
    const onHashChange = () => setAdmin(window.location.hash.startsWith("#/admin"));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const commit = useCallback((next: DomainState) => {
    try {
      if (!repository.current) throw new Error("El almacenamiento local no está disponible.");
      const current = reevaluateBookingExpirations(next, new Date().toISOString());
      repository.current.save(current);
      stateRef.current = current;
      setState(current);
      setStorageError(null);
    } catch (error) {
      const message = errorMessage(error);
      setStorageError(message);
      throw new Error(message);
    }
  }, []);

  const currentState = useCallback(() => {
    const previous = stateRef.current;
    if (!previous) throw new Error("No se pudieron cargar los datos de la demo.");
    const current = reevaluateBookingExpirations(previous, new Date().toISOString());
    if (hasExpiredChanges(previous, current)) commit(current);
    return current;
  }, [commit]);

  const restore = useCallback(() => {
    try {
      const store = repository.current ?? createBrowserRepository();
      const next = store.restore(createDemoSeed(), true);
      repository.current = store;
      stateRef.current = next;
      setState(next);
      setStorageError(null);
    } catch (error) {
      const message = errorMessage(error);
      setStorageError(message);
      throw new Error(message);
    }
  }, []);

  const getSlots = useCallback(
    async (date: string, serviceIds: string[], selectedBarberId: string): Promise<PublicSlot[]> => {
      const current = currentState();
      const selected = serviceIds.map((id) =>
        current.services.find((service) => service.id === id && service.active),
      );
      if (selected.some((service) => !service || service.requiresConsultation)) return [];
      const durationMinutes = selected.reduce(
        (sum, service) => sum + (service?.durationMinutes ?? 0),
        0,
      );
      const barbers = current.business.barbers ?? [current.business.barber];
      const selectedBarbers =
        selectedBarberId === ANY_AVAILABLE_BARBER
          ? barbers
          : barbers.filter((barber) => barber.id === selectedBarberId);
      const now = new Date().toISOString();
      const choicesByStart = new Map<string, PublicSlot[]>();

      for (const barber of selectedBarbers) {
        const available = getAvailableSlots({
          config: current.business,
          bookings: current.bookings,
          visits: current.visits,
          barberId: barber.id,
          date,
          durationMinutes,
          now,
        });
        for (const startsAt of available) {
          const choices = choicesByStart.get(startsAt) ?? [];
          choices.push({
            startsAt,
            barberId: barber.id,
            barberName: barber.name,
            label: new Intl.DateTimeFormat("es-BO", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: current.business.timeZone,
            }).format(new Date(startsAt)),
          });
          choicesByStart.set(startsAt, choices);
        }
      }

      const bookingsFor = (barberId: string) =>
        current.bookings.filter(
          (booking) =>
            booking.barberId === barberId &&
            isBlockingBooking(booking.status) &&
            localDateTime(Date.parse(booking.startsAt), current.business.timeZone).date === date,
        ).length;
      return [...choicesByStart.entries()]
        .map(([, choices]) => {
          choices.sort((left, right) => bookingsFor(left.barberId) - bookingsFor(right.barberId));
          return choices[0]!;
        })
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    },
    [currentState],
  );

  const reserve = useCallback(
    (input: {
      serviceIds: string[];
      date: string;
      slot: PublicSlot;
      customer: PublicCustomer;
    }): PublicBooking => {
      const current = currentState();
      const id = identifier("booking");
      const code = `BOSS-${id.slice(-6).toUpperCase()}`;
      const created = createBooking(current, {
        id,
        code,
        customer: {
          id: identifier("customer"),
          name: input.customer.name.trim(),
          phone: input.customer.phone.trim(),
          email: input.customer.email?.trim() || undefined,
          preferences: input.customer.preferences,
        },
        barberId: input.slot.barberId,
        source: "WEB",
        startsAt: input.slot.startsAt,
        serviceIds: input.serviceIds,
        now: new Date().toISOString(),
      });
      commit({
        ...upsertCustomer(current, created.customer),
        bookings: [...current.bookings, created],
        bookingEvents: [
          ...current.bookingEvents,
          {
            id: identifier("event"),
            bookingId: created.id,
            action: "CREATED",
            actor: "CUSTOMER",
            occurredAt: created.createdAt,
          },
        ],
      });
      const label = new Intl.DateTimeFormat("es-BO", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: current.business.timeZone,
      }).format(new Date(created.startsAt));
      return {
        id: created.id,
        code: created.code,
        expiresAt: created.expiresAt!,
        startsAt: created.startsAt,
        startLabel: `${label} · ${input.slot.barberName}`,
        amount: created.totalPrice,
        items: created.items.map((item) => ({
          id: item.serviceId,
          name: item.name,
          price: item.price,
          duration: item.durationMinutes,
        })),
      };
    },
    [commit, currentState],
  );

  const handleDeclare = useCallback(
    (bookingId: string) => {
      try {
        const current = currentState();
        const booking = current.bookings.find((item) => item.id === bookingId);
        if (!booking) throw new Error("No se encontró la solicitud local.");
        const now = new Date().toISOString();
        const next = declarePayment(current, bookingId, {
          id: identifier("payment"),
          amount: booking.totalPrice,
          method: "BANK_TRANSFER",
          now,
        });
        commit({
          ...next,
          bookingEvents: [
            ...next.bookingEvents,
            {
              id: identifier("event"),
              bookingId,
              action: "PAYMENT_DECLARED",
              actor: "CUSTOMER",
              occurredAt: now,
            },
          ],
        });
        return { success: true as const };
      } catch (error) {
        return { success: false as const, message: errorMessage(error) };
      }
    },
    [commit, currentState],
  );

  return (
    <Shell admin={admin}>
      {storageError && state && (
        <div className="app-storage-error" role="alert">
          No se pudieron guardar o leer los datos locales: {storageError}. Comprueba el
          almacenamiento del navegador.
        </div>
      )}
      {!state ? (
        <main className="app-error">
          <h1>No se pueden cargar los datos locales</h1>
          <p>{storageError}</p>
          <p>
            No se ha borrado ningún dato. Comprueba los permisos del navegador e inténtalo de nuevo.
            Si los datos son incompatibles, puedes restaurar los datos iniciales de demostración;
            esta acción sustituirá los cambios locales.
          </p>
          <div className="app-error-actions">
            <Button
              type="button"
              onClick={() => {
                const next = initialize();
                repository.current = next.repository;
                stateRef.current = next.state;
                setState(next.state);
                setStorageError(next.error);
              }}
            >
              Reintentar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Restaurar los datos iniciales? Se sustituirán los datos locales de esta demo.",
                  )
                ) {
                  try {
                    restore();
                  } catch {
                    /* Error is displayed above. */
                  }
                }
              }}
            >
              Restaurar datos iniciales
            </Button>
          </div>
        </main>
      ) : admin ? (
        <AdminContainer state={state} commit={commit} restore={restore} />
      ) : (
        <PublicApp
          businessName={state.business.name}
          timeZone={state.business.timeZone}
          services={state.services
            .filter((service) => service.active)
            .map((service) => ({
              id: service.id,
              name: service.name,
              price: service.price,
              duration: service.durationMinutes,
              requiresConsultation: service.requiresConsultation,
            }))}
          barbers={(state.business.barbers ?? [state.business.barber]).map(
            (barber): PublicBarber => ({ id: barber.id, name: barber.name }),
          )}
          getSlots={getSlots}
          reserve={reserve}
          declarePayment={handleDeclare}
          whatsapp={publicConfig.whatsapp}
          qrUrl={publicConfig.paymentQr}
          paymentInstructions={publicConfig.paymentInstructions}
        />
      )}
    </Shell>
  );
}
