import { validateDomainState } from "../domain/validation";
import type { DomainState } from "../domain/types";

export const STORAGE_SCHEMA_VERSION = 1;
export const DEFAULT_STORAGE_KEY = "barber-boss-demo";

export type RepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "INCOMPATIBLE_DATA"
  | "INVALID_DATA";

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  readonly cause?: unknown;

  constructor(code: RepositoryErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
    this.cause = cause;
  }
}

interface Envelope {
  schemaVersion: number;
  data: DomainState;
}

export interface LocalRepository {
  load(): DomainState | null;
  save(state: DomainState): void;
  initialize(initialState: DomainState): DomainState;
  restore(initialState: DomainState, confirmed: boolean): DomainState;
}

/** localStorage adapter; corrupt or newer data is never overwritten implicitly. */
export function createLocalRepository(
  storage: Storage,
  key = DEFAULT_STORAGE_KEY,
): LocalRepository {
  if (!storage)
    throw new RepositoryError("STORAGE_UNAVAILABLE", "El almacenamiento local no está disponible");
  const parse = (): Envelope | null => {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      throw new RepositoryError("READ_FAILED", "No se pudieron leer los datos locales", error);
    }
    if (raw === null) return null;
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      throw new RepositoryError(
        "INVALID_DATA",
        "Los datos locales no son JSON válido; no se modificaron",
        error,
      );
    }
    if (
      !decoded ||
      typeof decoded !== "object" ||
      !("schemaVersion" in decoded) ||
      !("data" in decoded)
    ) {
      throw new RepositoryError(
        "INVALID_DATA",
        "El formato local no es compatible; no se modificó",
      );
    }
    const envelope = decoded as Envelope;
    if (envelope.schemaVersion !== STORAGE_SCHEMA_VERSION) {
      throw new RepositoryError(
        "INCOMPATIBLE_DATA",
        `Versión local ${envelope.schemaVersion} incompatible con ${STORAGE_SCHEMA_VERSION}; restaura solo con confirmación explícita`,
      );
    }
    try {
      validateDomainState(envelope.data);
    } catch (error) {
      throw new RepositoryError(
        "INVALID_DATA",
        "Los datos locales no pasan la validación; no se modificaron",
        error,
      );
    }
    return envelope;
  };
  const writeValidated = (state: DomainState): void => {
    try {
      validateDomainState(state);
    } catch (error) {
      throw new RepositoryError("INVALID_DATA", "No se guardaron datos inválidos", error);
    }
    try {
      storage.setItem(
        key,
        JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION, data: state } satisfies Envelope),
      );
    } catch (error) {
      throw new RepositoryError("WRITE_FAILED", "No se pudieron guardar los datos locales", error);
    }
  };
  return {
    load() {
      return parse()?.data ?? null;
    },
    save(state) {
      // Refuse to overwrite an unreadable/incompatible snapshot. Restoration is the explicit escape hatch.
      parse();
      writeValidated(state);
    },
    initialize(initialState) {
      const existing = parse();
      if (existing) return existing.data;
      writeValidated(initialState);
      return initialState;
    },
    restore(initialState, confirmed) {
      if (!confirmed)
        throw new RepositoryError(
          "INCOMPATIBLE_DATA",
          "La restauración requiere confirmación explícita",
        );
      writeValidated(initialState);
      return initialState;
    },
  };
}

export function createBrowserRepository(key = DEFAULT_STORAGE_KEY): LocalRepository {
  try {
    if (typeof globalThis.localStorage === "undefined")
      throw new Error("localStorage no disponible");
    return createLocalRepository(globalThis.localStorage, key);
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(
      "STORAGE_UNAVAILABLE",
      "El navegador no permite almacenamiento local",
      error,
    );
  }
}
