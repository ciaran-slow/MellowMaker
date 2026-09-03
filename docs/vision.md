# vision.md — MellowMaker App

> **Core Objective:** To build a cross-platform mobile application (iOS & Android) using React Native, Expo, and EAS that acts as the ultimate bright, colourful, and engaging digital companion for makers—combining an offline-first stitch dictionary, interactive step-by-step pattern management, a built-in row/stitch counter, and an innovative YouTube guide importer.

---

## 1. Product Vision & Philosophy

Crocheting is a joyful, creative craft, but modern makers often juggle multiple tabs, messy paper notes, and disjointed video tutorials while trying to keep track of their rows. **MellowMaker** bridges the gap between traditional craft and vibrant digital utility. 

* **Frictionless & Offline-Friendly:** Crafters work everywhere—on the couch, at meetups, or while traveling. All core patterns, imported guides, and stitch dictionaries must live locally on the device via SQLite.
* **Bright, Playful, & Engaging:** Inspired by fun, approachable design systems (like The Woobles), the interface features high-energy colors, chunky rounded corners, friendly typography, and delightful micro-interactions that make tracking progress feel rewarding.
* **Bridge to Video Content:** By allowing users to ingest and structure YouTube tutorials into actionable, step-by-step guides, the app transforms passive viewing into active, confident making.

---

## 2. Target Audience

* **Beginner to Intermediate Crocheters:** Makers who need clear visual references, reliable row counters, and friendly guided walkthroughs.
* **Self-Taught Crafters:** People who rely heavily on video tutorials but want a structured, distraction-free companion to keep their place and take notes.

---

## 3. Core Feature Set (MVP Scope)

### A. Stitch Dictionary
* **Comprehensive Database:** A searchable catalog of standard crochet stitches (e.g., Single Crochet, Double Crochet, Half Double Crochet, Treble).
* **Rich Guides:** Step-by-step text instructions, difficulty ratings, abbreviations, and bright visual references.

### B. Pattern Library & Interactive Viewer
* **Project Management:** Create, edit, and organize personal or imported patterns.
* **Interactive Checklist Steps:** Break patterns down into discrete rows or steps that users can check off with satisfying visual feedback.
* **Persistent Row/Stitch Counter:** A prominent, easy-to-tap counter embedded directly into the active pattern view.

### C. YouTube Guide Importer
* **URL Parsing:** Accept a YouTube link pasted by the user in any common form (watch, share, Shorts, embed, or live) and settle on one canonical video identity.
* **Metadata Extraction:** Fetch the video title, thumbnail, and creator info through YouTube's public, key-free oEmbed endpoint, treated as display-only.
* **Structured Breakdown:** Map video timestamps and optional transcript excerpts into readable, step-by-step instructions beside an embedded player. YouTube plays inside its own official **IFrame player** (rendered in a WebView), so tapping a timestamped step seeks the video—with a link-out to the YouTube app and an offline saved-guide fallback whenever playback is unavailable.
* **Maker-Supplied Sources:** Those timestamps and excerpts are always the maker's own—typed by hand, or **pasted** from text they copied out of YouTube themselves (the video's description chapter list first, its transcript panel as a fallback) and confirmed before anything is saved. **MellowMaker never fetches transcripts, captions, chapters, or descriptions**, keeps only the text that becomes a step, and sends nothing off the device.
* **Save as Pattern:** Turn a guide into a real pattern in the library—its steps copied across in order with the source video link kept in the pattern's notes—which is what makes the "imported patterns" of section B above an actual import path. The pattern is an independent snapshot: deleting the guide never touches it.

---

## 4. Design System & UI Architecture ("Playful Craft")

* **Styling Framework:** **NativeWind v4 (Tailwind CSS)** + **React Native Reanimated** for bouncy, tactile micro-interactions.
* **Color Palette:**
  * **Backgrounds:** Clean, bright off-white backdrop (`#F9F8F6`) to let rich colors pop.
  * **Cards & Containers:** Crisp white cards (`#FFFFFF`) with soft, friendly shadows.
  * **Dopamine Accents:** Playful pink (`#FF6B8B`), sunny yellow (`#FFD166`), fresh success teal (`#06D6A0`), pop blue (`#118AB2`), and deep ink text (`#26547C`).
  * **Strong Accents (text surfaces only):** deeper companions to three of the accents — pink `#C15169`, teal `#048765`, blue `#1080A6` — used wherever text or a selection indicator sits on an accent, so labels stay legible (at least 4.5:1 with white text, 3:1 against the backdrop) while the bright accents keep to decorative fills, borders, and bars. Yellow already carries ink text legibly and needs no companion.
* **Shape & Typography:**
  * **Rounded Corners:** Chunky, friendly border radii (`rounded-3xl`) for buttons, cards, and interactive elements.
  * **Typography:** Clean, highly legible sans-serif font weights optimized for quick glances while holding a crochet hook.

---

## 5. Technical Stack Overview

* **Framework:** React Native with **Expo (Managed Workflow, SDK 52+)**.
* **Language:** TypeScript for type safety across navigation, state, and local data schemas.
* **Local Storage:** `expo-sqlite` for offline-first persistence of patterns, stitches, and imported metadata.
* **Media Rendering:** YouTube plays through its official **IFrame Player API in a WebView** (`react-native-youtube-iframe` over `react-native-webview`, both Expo-managed compatible), which exposes `seekTo` for timestamped steps and stays within YouTube's terms; a link-out plus an offline saved-guide fallback covers unavailable playback. `expo-video` is retained in the stack only for possible future non-YouTube media.
* **Deployment Pipeline:** **EAS (Expo Application Services)** configured for automated cloud builds (`.aab` for Android, `.ipa` for iOS) targeting both the Apple App Store and Google Play Store.