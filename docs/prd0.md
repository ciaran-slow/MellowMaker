# MellowMaker PRD0

**Status:** Baseline MVP product requirements  
**Product:** MellowMaker for iOS and Android  
**Source:** [`vision.md`](./vision.md)  
**Architecture:** [`architecture.md`](./architecture.md)

## 1. Product objective

MellowMaker is a bright, friendly, offline-first crochet companion. It gives beginner and intermediate makers one dependable place to learn stitches, organize patterns, follow steps, track rows or stitches, and turn YouTube tutorials into structured guides.

PRD0 defines the first complete product release. It prioritizes reliable making sessions over accounts, sharing, automation, or cloud services.

## 2. Problem statement

Crocheters frequently move between video players, browser tabs, paper notes, counters, and pattern documents. That fragmentation makes it easy to lose the current row, forget which step is complete, or abandon a tutorial when connectivity is poor.

MellowMaker should reduce that cognitive load by keeping instructions, progress, and counting tools together and available wherever the maker works.

## 3. Target users

### 3.1 Beginner to intermediate crocheter

Needs clear stitch references, approachable instructions, a forgiving counter, and visible progress through a pattern.

### 3.2 Self-taught video learner

Finds projects through YouTube and needs a structured, distraction-reduced way to retain timestamps, instructions, notes, and their current place.

## 4. Product principles

1. **Offline by default:** Losing connectivity must not end an active making session.
2. **Progress is precious:** Acknowledged counter and checklist changes must survive navigation and restart.
3. **One-handed clarity:** Frequent actions are prominent, forgiving, and easy to use while holding a crochet hook.
4. **Playful, not distracting:** Color and motion reward progress while instructions remain legible.
5. **Manual control remains available:** Remote metadata or transcript automation may help, but it must not prevent a maker from structuring a guide themselves.

## 5. PRD0 scope

PRD0 includes:

- an offline stitch dictionary;
- a personal pattern library and editor;
- an interactive pattern viewer;
- persistent row/stitch counters;
- YouTube URL import with metadata;
- saved, timestamped guide steps and notes;
- embedded YouTube playback through the YouTube IFrame Player API in a WebView, with a link-out and offline fallback;
- local persistence through `expo-sqlite`;
- iOS and Android builds through Expo and EAS.

## 6. Primary user journeys

### Journey A — Look up a stitch

1. The maker opens the stitch dictionary with or without connectivity.
2. They browse or search by stitch name or abbreviation.
3. They open a result and read its difficulty, abbreviation, visual reference, and ordered instructions.
4. They return to their project without losing its progress.

### Journey B — Create and work a pattern

1. The maker creates a pattern and adds ordered rows or steps.
2. They open the pattern in an interactive viewer.
3. They mark steps complete and use the visible counter while working.
4. They leave or close the app.
5. On return, the same completed steps, active position, and count are restored.

### Journey C — Turn a YouTube tutorial into a guide

1. The maker pastes a supported YouTube URL.
2. MellowMaker validates it and retrieves available title, thumbnail, and creator metadata.
3. The maker reviews and edits the guide details.
4. They create or refine ordered instructions with timestamps and optional transcript excerpts or notes.
5. They save the guide and follow it beside the embedded video.
6. Later, without connectivity, they can still read the saved guide and see their progress; video playback clearly reports that a connection may be required.

## 7. Functional requirements

### 7.1 Stitch dictionary

- **FR-ST-01:** The app shall provide a locally stored catalog of standard crochet stitches.
- **FR-ST-02:** A maker shall be able to browse the catalog without network access.
- **FR-ST-03:** A maker shall be able to search by stitch name and abbreviation without network access.
- **FR-ST-04:** Search shall handle case differences and surrounding whitespace.
- **FR-ST-05:** Each stitch detail shall show its name, abbreviation, difficulty, ordered text instructions, and available local visual references.
- **FR-ST-06:** An empty search shall return the browse state; a search with no matches shall show a clear empty result rather than an error.

The initial content set and image licensing are approved: the project authors and
owns the bundled instruction text and bundles no third-party imagery, and twelve
records ship as the PRD0 set. See [`content-provenance.md`](./content-provenance.md).
Seed updates must not overwrite maker-created data.

### 7.2 Pattern library

- **FR-PA-01:** A maker shall be able to create a personal pattern with a title.
- **FR-PA-02:** A maker shall be able to edit and delete a personal pattern.
- **FR-PA-03:** Destructive deletion shall require deliberate confirmation and explain that local progress will also be removed.
- **FR-PA-04:** A maker shall be able to add, edit, delete, and reorder pattern steps or rows.
- **FR-PA-05:** Pattern and step changes shall persist locally without network access.
- **FR-PA-06:** The library shall provide a clear empty state that leads to pattern creation.
- **FR-PA-07:** The library shall use one consistent initial organization method. Tags, folders, and advanced filtering are not all required for PRD0.

### 7.3 Interactive pattern viewer

- **FR-PV-01:** The viewer shall display pattern steps in their saved order.
- **FR-PV-02:** A maker shall be able to mark a step complete and reopen it.
- **FR-PV-03:** Completion state shall persist immediately and survive an app restart.
- **FR-PV-04:** The viewer shall make the active or next incomplete step visually clear without relying on color alone.
- **FR-PV-05:** Returning from another screen shall restore the maker's position and progress.
- **FR-PV-06:** Rapid repeated completion actions shall not duplicate, skip, or corrupt steps.

### 7.4 Row and stitch counters

- **FR-CO-01:** An active pattern or guide shall expose a prominent counter reachable from the working view.
- **FR-CO-02:** A maker shall be able to increment the count with one primary tap.
- **FR-CO-03:** A maker shall be able to correct an accidental increment by decrementing the count, without going below zero.
- **FR-CO-04:** A maker shall be able to reset a nonzero count through a deliberate confirmed action.
- **FR-CO-05:** The counter shall be associated with the pattern or guide being worked rather than shared accidentally across projects.
- **FR-CO-06:** Every acknowledged change shall persist locally and survive navigation and restart.
- **FR-CO-07:** Rapid taps shall produce exactly the corresponding count without lost or duplicated updates.
- **FR-CO-08:** Counter changes shall provide immediate visual or tactile feedback while remaining usable when reduced motion is preferred.

**Resolved (decision 3, issue #7): PRD0 presents one maker-labelled counter per project** (default label "Rows"), not separate row and stitch counters. The persistence model still supports either choice — the schema permits many counters per owner — so the single counter is surfaced through an idempotent owner-keyed accessor without a migration, leaving separate typed counters reachable as a future deliberate decision. See `docs/architecture.md` sections 6 and 11.

### 7.5 YouTube guide import

- **FR-YT-01:** A maker shall be able to paste a supported YouTube URL.
- **FR-YT-02:** The importer shall reject malformed, unsupported, or non-YouTube input with an actionable message.
- **FR-YT-03:** Supported URL forms shall normalize to one canonical video identity so the same video is not duplicated accidentally.
- **FR-YT-04:** When connectivity and the selected provider permit, the importer shall fetch the video title, thumbnail, and creator.
- **FR-YT-05:** Missing optional metadata shall be editable and shall not block manual guide creation.
- **FR-YT-06:** A failed import shall not create a misleading partial guide unless the maker explicitly chooses to continue manually.
- **FR-YT-07:** Retrying or refreshing an existing guide shall not duplicate its steps or erase locally edited instructions.
- **FR-YT-08:** The app shall not claim that a transcript is available when the provider returns none.

### 7.6 Structured guide authoring and viewing

- **FR-GU-01:** A maker shall be able to create, edit, delete, and reorder guide steps.
- **FR-GU-02:** A guide step shall support instruction text and an optional video timestamp.
- **FR-GU-03:** A guide step may include an optional transcript excerpt or maker note.
- **FR-GU-04:** Selecting a timestamped step shall seek the embedded YouTube IFrame player (rendered in a WebView) when playback is available.
- **FR-GU-05:** Guide content and completion state shall be saved locally and readable offline.
- **FR-GU-06:** Video-unavailable and offline states shall preserve access to saved instructions and progress.
- **FR-GU-07:** Remote titles, creator names, and transcript text shall be treated as display-only untrusted content.
- **FR-GU-08:** Automatically generated breakdowns are optional for PRD0. Manual timestamped authoring is the required fallback.

### 7.7 Local data and startup

- **FR-DA-01:** The app shall initialize and migrate its local SQLite database before showing data-dependent screens as ready.
- **FR-DA-02:** Schema upgrades shall preserve existing user-created patterns, guides, notes, progress, and counters.
- **FR-DA-03:** A failed migration shall not be reported as successful or silently reset maker data.
- **FR-DA-04:** Core screens shall start and remain usable in airplane mode after installation data and user content are present.
- **FR-DA-05:** A failed remote refresh shall leave the last successfully saved guide intact.

## 8. Experience and design requirements

- **UX-01:** The app shall use the Playful Craft palette defined in `vision.md`: off-white backgrounds, white cards, pink/yellow/teal/blue accents, and deep ink text.
- **UX-02:** Cards, controls, and interactive surfaces shall use a friendly rounded visual language with clear hierarchy.
- **UX-03:** Typography shall remain legible at supported system text sizes.
- **UX-04:** Progress and successful interactions may use brief Reanimated feedback, but animation shall not delay persistence or block the next action.
- **UX-05:** Loading, empty, offline, error, and saved states shall be visually distinct and expressed in text where meaning matters.
- **UX-06:** Frequent working-view actions shall be reachable and understandable while using the device one-handed.
- **UX-07:** New screens shall use centralized design tokens rather than introducing near-duplicate colors or spacing values.

## 9. Accessibility requirements

- **A11Y-01:** Interactive elements shall expose meaningful React Native accessibility labels, roles, and state.
- **A11Y-02:** Touch targets shall be comfortably operable and not require precision taps.
- **A11Y-03:** Completion, selection, success, and error shall not be communicated by color alone.
- **A11Y-04:** Text and controls shall maintain usable contrast against the documented palette.
- **A11Y-05:** The app shall support text scaling without clipping essential instructions or counter controls.
- **A11Y-06:** Nonessential motion shall be reduced or removed when the platform reduced-motion preference is active.
- **A11Y-07:** Screen-reader focus and announcements shall make counter changes, step completion, errors, and loading completion understandable.

## 10. Non-functional requirements

### Offline and reliability

- **NFR-01:** Core dictionary, pattern, guide-text, progress, and counter operations shall not require a network request.
- **NFR-02:** Acknowledged local writes shall remain present after immediate app termination and restart.
- **NFR-03:** Multi-record saves and migrations shall not expose partially committed user data.
- **NFR-04:** Network failure shall be isolated from existing local content.

### Platform and delivery

- **NFR-05:** PRD0 shall support current project-defined iOS and Android deployment targets.
- **NFR-06:** Production `.ipa` and `.aab` artifacts shall be generated through committed EAS configuration without committed signing secrets.
- **NFR-07:** Dependencies and native capabilities shall remain compatible with Expo managed workflow and the installed SDK.

### Performance

- **NFR-08:** Counter and checklist feedback shall be immediate from the user's perspective and independent of network latency.
- **NFR-09:** Long stitch, pattern, and guide-step lists shall use bounded queries or list virtualization rather than rendering or copying the entire dataset unnecessarily.
- **NFR-10:** Video resources and subscriptions shall be released when their owning view is no longer active.

### Privacy and security

- **NFR-11:** The app shall not commit or bundle private provider credentials, signing secrets, or developer-machine configuration.
- **NFR-12:** Imported remote text shall never be executed as code or markup.
- **NFR-13:** Maker-created pattern, note, progress, and guide content shall remain on device in PRD0 unless a later feature explicitly introduces sharing or synchronization.

### Maintainability and quality

- **NFR-14:** TypeScript shall run with strict type checking.
- **NFR-15:** SQL shall be isolated behind data-access boundaries and parameterized.
- **NFR-16:** Changed user contracts shall have falsifiable automated coverage at the narrowest useful level.
- **NFR-17:** Critical flows shall have a repeatable smoke scenario on the relevant platform target.

## 11. Release acceptance

PRD0 is releasable when all of the following are demonstrated:

1. The configured repository gates and EAS configuration checks pass.
2. iOS and Android builds install and launch on the supported targets.
3. The bundled stitch dictionary can be searched and read in airplane mode.
4. A pattern can be created, edited, reopened, and deleted deliberately.
5. Step progress and at least one counter can be changed rapidly and restored after restart with the exact expected state.
6. A supported YouTube URL can create a guide with available metadata.
7. Missing transcript/metadata and network failure allow a clear manual path without corrupting a saved guide.
8. Saved guide steps and progress remain readable offline; when the embedded YouTube IFrame player cannot play, the unavailable state and the link-out fallback are communicated clearly.
9. A populated database upgrades from the previous release schema without losing maker data.
10. Critical working views pass the repository's accessibility checks and a screen-reader smoke pass.
11. Production EAS profiles can produce both store artifact types without secrets in source control.

## 12. Out of scope for PRD0

- User accounts, authentication, or profiles
- Cloud backup or cross-device synchronization
- Social feeds, community sharing, comments, or messaging
- Pattern marketplace, purchases, subscriptions, or advertising
- Offline YouTube video downloading
- Guaranteed automatic transcript extraction for every video
- Fully automatic generation of a correct crochet pattern from a video
- General-purpose web administration or backend services
- Crafts other than crochet

## 13. Product decisions still required

These decisions should be resolved in the issue that first implements them:

1. ~~Licensed source and minimum content set for stitch instructions and images.~~
   Resolved: original text authored and owned by the project, no bundled
   third-party imagery, twelve records at seed version 1. See
   [`content-provenance.md`](./content-provenance.md).
2. Navigation structure and names for the primary tabs/screens.
3. ~~One counter with a maker-defined label versus separate row and stitch
   counters.~~ Resolved (issue #7): **one maker-labelled counter per project**
   (default label "Rows", `kind 'custom'`), surfaced through the idempotent
   `getOrCreatePrimaryCounter` accessor with the schema unchanged so separate or
   guide counters remain reachable without a migration. See §7.4 and
   `docs/architecture.md` sections 6 and 11.
4. Initial pattern organization: recent ordering, tags, or folders.
5. ~~Supported YouTube URL forms and the compliant metadata/transcript
   provider.~~ Resolved (issue #8): support `watch?v=`, `youtu.be/`, `shorts/`,
   `embed/`, and `live/` forms (with or without extra params), normalized to the
   bare 11-character `[A-Za-z0-9_-]{11}` video id as the canonical identity so the
   same video never duplicates; metadata comes from the key-free **YouTube
   oEmbed** endpoint (title/author/thumbnail, display-only untrusted text), and
   transcripts are **optional/manual** because no compliant public transcript API
   exists. The keyed YouTube Data API v3 is rejected for the client because it
   would embed a secret (NFR-11/13). See §7.5–7.6 and the URL matrix in
   `docs/architecture.md` §9.
6. ~~A compliant video source that `expo-video` can play without scraping or
   reverse-engineering YouTube media URLs; if none is available, the product
   vision must be revised before implementation.~~ Resolved (issue #8):
   `expo-video` **cannot** compliantly play YouTube—it plays direct media streams
   only, and obtaining a YouTube media URL requires the forbidden scraping—so the
   vision is revised to play YouTube through the **YouTube IFrame Player API in a
   WebView** (`react-native-youtube-iframe` over `react-native-webview`, both
   Expo-managed compatible), which exposes `seekTo` for FR-GU-04, with a link-out
   and offline saved-guide fallback. `expo-video` is retained only for possible
   future non-YouTube media. See §5, FR-GU-04, `docs/vision.md`, and
   `docs/architecture.md` §9.
7. ~~Whether analytics or crash reporting is appropriate and what privacy
   disclosure it requires.~~ Resolved (issue #13): **no analytics, crash
   reporting, or telemetry in PRD0** — nothing leaves the device (NFR-13).
   Enforced by `tests/analyticsAbsent.test.ts` (dependency/plugin denylist) and
   the #12 offline no-egress suite. Any future adoption requires a separate
   decision with its own privacy disclosure. See `docs/architecture.md` §12.
8. Minimum supported iOS and Android versions for the first EAS release.

## 14. Traceability to the vision

| Vision section | PRD0 coverage |
|---|---|
| Product vision and philosophy | Sections 1–4, 8, and 10 |
| Target audience | Section 3 |
| Stitch dictionary | Journey A and Section 7.1 |
| Pattern library and viewer | Journey B and Sections 7.2–7.4 |
| YouTube guide importer | Journey C and Sections 7.5–7.6 |
| Playful Craft design system | Sections 8 and 9 |
| Technical stack and deployment | Sections 10 and 11 |
