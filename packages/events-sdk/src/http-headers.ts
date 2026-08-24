// Header a client may set on POST /purchases to make a retry (e.g. after a timeout) safe:
// resubmitting the same key returns the original purchase instead of creating a duplicate.
// Shared so the gateway (which forwards it) and purchase-service (which acts on it) can't
// silently drift onto two different header names.
export const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';
