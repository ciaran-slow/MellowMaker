# Deferred on-device smoke — issue #9

- **Issue:** #9
- **PR:** #31
- **Flow file:** `.maestro/guides.yaml`
- **Status:** Open

## Proxy coverage that ran

Jest domain (`youtubeUrl` supported-forms/rejections/id-boundary, `guideImportLabels`) + `youtubeOembedGateway` (injected-`fetch` mapping + every failure reason + html/transcript boundary) + `guideRepository` (dedup UNIQUE, refresh title/step preservation + COALESCE, `listGuides` recency) + `GuideImportScreen`/`GuideDetailScreen`/`GuidesScreen` component + real-router `guidesNavigation` suites

## Still on-device-unverified

AC "created guide survives **app restart**, offline" (relaunch step 6), the **Android airplane-mode** metadata-unavailable manual path (step 3), and Android **hardware-back** — true relaunch and the native airplane toggle never exercised on a device (Jest reopen + fake gateway are the proxy)
