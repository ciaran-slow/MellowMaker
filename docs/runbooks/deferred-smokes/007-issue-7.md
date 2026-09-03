# Deferred on-device smoke — issue #7

- **Issue:** #7
- **PR:** #27
- **Flow file:** `.maestro/counter.yaml`
- **Status:** Open

## Proxy coverage that ran

Jest domain (`counterLabel`) + repository (idempotent accessor, clamp, rename, per-owner isolation, reopen durability) + `CraftCounter` control + `PatternCounter` wired hook/screen (rapid double-tap→2, clamp-at-zero, reset cancel/confirm, two-pattern isolation, remount durability, rename, a11y announcement) suites (245 tests)

## Still on-device-unverified

AC "every acknowledged change survives navigation and immediate **app restart**" — true relaunch never exercised on a device (Jest reopen/remount is the proxy); real one-handed tap gestures and the reduced-motion pop on-device
