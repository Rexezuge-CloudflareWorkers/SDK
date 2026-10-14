---
'@rexezuge/identity': minor
---

`UserEmailDAO.register` no longer re-points a **verified** address, and
`resolveAccount` no longer authenticates through an anchor the account has moved
off. Both were found by AWS-AccessBridge adopting this package against its own
frozen-anchor tables, and both are the kind the kit's own suite passed on: the
first is a race, the second is a takeover.

**`register` loses no races.** The claim was a read (`get`) followed by an
unconditional `ON CONFLICT(email) DO UPDATE`. Those are two statements, so a
caller that had just verified the address was already racing another claim for it
— and the loser's `DO UPDATE` rewrote a row that was verified _now_, re-pointing
one account's identity at another. The upsert now carries
`WHERE user_emails.is_verified = 0` and reads the verdict from `meta.changes`, so
"lost the race" and "the address was taken" answer the same `'already-claimed'`.
The invariant moves from a statement ordering nobody can see to the write itself.
An **unverified** row is still re-pointed, so a released address is never
permanently reserved.

**An anchor is not a login address.** `resolveAccount`'s third arm — the
pre-identity anchor lookup — returned the row it found without asking whether the
account still held that address. An anchor is frozen, so a row found there whose
`current_email` has moved away is an account that _left_: answering with its id
installed the caller's identity as that account. It was reachable whenever the
registry could not answer — a database that has not run the identity migration
has no `user_emails` table at all, and the migration deliberately leaves
`current_email` NULL for the mixed-case accounts it cannot disambiguate. The
guard is the one the registry branch already applies, reached the other way
round, compared case-insensitively on both sides because `getByEmail` lowercases
its parameter while the anchor is stored as originally supplied.
