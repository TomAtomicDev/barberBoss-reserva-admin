export type DomainErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "SLOT_UNAVAILABLE"
  | "CONSULTATION_REQUIRED"
  | "BOOKING_EXPIRED"
  | "DUPLICATE_MOVEMENT"
  | "NONEXISTENT_LOCAL_TIME";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError("INVALID_INPUT", message);
}
