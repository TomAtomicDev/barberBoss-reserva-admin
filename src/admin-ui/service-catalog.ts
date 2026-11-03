import type { ServiceDraft } from "./types";
import type { DomainState, Service } from "../domain";

/**
 * Immutable catalog update. Booking item snapshots are intentionally untouched.
 * Full-state/domain validation is performed by the container before commit.
 */
export function updateServiceCatalog(
  state: DomainState,
  draft: ServiceDraft,
  createId: () => string,
): DomainState {
  const name = draft.name.trim();
  if (!name) throw new Error("El nombre del servicio es obligatorio.");
  if (!Number.isSafeInteger(draft.priceCents) || draft.priceCents < 0)
    throw new Error("El precio debe ser un importe válido en bolivianos.");
  if (!Number.isSafeInteger(draft.durationMinutes) || draft.durationMinutes < 0)
    throw new Error("La duración debe ser un número entero de minutos igual o mayor que cero.");
  if (!draft.requiresConsultation && draft.priceCents === 0)
    throw new Error("Un servicio reservable debe tener un precio mayor que cero.");
  if (!draft.requiresConsultation && draft.durationMinutes === 0)
    throw new Error("Un servicio reservable debe tener una duración mayor que cero.");

  const existing = draft.id ? state.services.find((service) => service.id === draft.id) : undefined;
  if (draft.id && !existing) throw new Error("No se encontró el servicio que intentas editar.");
  if (existing && state.services.filter((service) => service.id === existing.id).length !== 1)
    throw new Error("El catálogo contiene identificadores de servicio duplicados.");

  const normalizedName = name.toLocaleLowerCase("es");
  const duplicate = state.services.find(
    (service) =>
      service.id !== existing?.id && service.name.trim().toLocaleLowerCase("es") === normalizedName,
  );
  if (duplicate) throw new Error(`Ya existe un servicio llamado “${duplicate.name}”.`);

  const service: Service = {
    id: existing?.id ?? createId(),
    name,
    price: draft.priceCents / 100,
    durationMinutes: draft.durationMinutes,
    active: draft.active,
    requiresConsultation: draft.requiresConsultation,
  };
  if (!existing && state.services.some((item) => item.id === service.id))
    throw new Error("No se pudo asignar un identificador único al servicio.");

  const services = existing
    ? state.services.map((item) => (item.id === existing.id ? service : item))
    : [...state.services, service];
  return { ...state, services };
}
