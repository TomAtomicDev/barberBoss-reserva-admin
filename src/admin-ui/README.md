# Admin UI presentation contract

`AdminApp.tsx` exports a default React component. It is intentionally a
presentation-only UI: it does not read/write localStorage, invent availability,
change records optimistically, or claim that a command succeeded. The host
passes `AdminData` and receives every domain intent through the typed callbacks
in `types.ts`.

`src/AdminContainer.tsx` adapts the domain state and its exported operations to
that presentation contract. Its props are `{ state, commit, restore }`; it
validates each result before calling `commit` and surfaces domain/commit errors
in the UI. It does not access browser storage. Service creation/editing uses an
immutable catalog update and leaves booking item snapshots unchanged.

## Props

- `data`: current fictitious demo snapshot: business/barber names and timezone, summary, bookings
  (with frozen item price/duration), customers, services, money movements,
  completed service visits, weekly schedule and exceptions. Instants are ISO
  strings, schedule dates/times are business-local, and money is BOB
  centavos. The UI displays the provided values without deriving domain totals.
  `barberName` is optional and defaults to the confirmed demo name, `Roly`;
  `businessName` should be configured as `Boss Barber Shop by RF`.
- `demoAccessGranted`: selects the simulated entry or dashboard. `onEnterDemo`
  reports the chosen visual role; this is not authentication or route security.
- `storageError`: optional storage failure/incompatible-data message shown with
  `role="alert"`; `onRetryStorage` requests a host retry. The UI never clears or
  restores data automatically.
- `feedback`: optional host-confirmed success/error message.
- `busy`: disables command controls while the host processes an action.
- Callbacks: all create, approve/reject/release, reschedule/cancel/no-show,
  walk-in/visit, sale/refund, service/schedule save and restore operations are
  reported to the host. A callback firing does not mean the operation completed.
- `BookingDraft.startsAt` and `RescheduleDraft.startsAt` are wall-clock strings
  in `data.timezone`, exactly `YYYY-MM-DDTHH:mm`. They are deliberately not
  converted through the device timezone or `Date`; an adapter must convert them
  to an instant using the configured business timezone before domain operations.
- `AdminBooking.events` and `AdminCustomer.events` contain mapped booking
  history with timestamp, action, actor and optional reason. `AdminData.visits`
  contains completed services and their amounts by date; those amounts are
  displayed separately and are never added to payment/refund movement totals.

All personal data shown should be fictitious. This public demo is not secure,
does not synchronize with other devices, and does not guarantee availability.
Payments/refunds shown here are records only; they are not bank verification,
money movement, or an automatic charge/refund. Restoring demo data removes
local changes and requires explicit confirmation.
