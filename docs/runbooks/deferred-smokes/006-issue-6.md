# Deferred on-device smoke — issue #6

- **Issue:** #6
- **PR:** #25
- **Flow file:** `.maestro/pattern-viewer.yaml`
- **Status:** Open

## Proxy coverage that ran

Jest domain + repository (serialization/durability) + `PatternViewerScreen` component + real-router navigation suites (220 tests)

## Still on-device-unverified

AC "completed/reopened state survives immediate termination and **app restart**" and on-device scroll-to-current-step restoration — true relaunch and real scroll never exercised on a device
