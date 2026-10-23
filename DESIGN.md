---
version: alpha
name: "KontrolPR"
description: "An expressive midnight-blue review desk with sapphire actions, mint, coral and amber review cues."
colors:
  primary: "#87ADFF"
  primaryHover: "#A1BEFF"
  onPrimary: "#10213B"
  background: "#101A27"
  surface: "#172638"
  surfaceRaised: "#21344A"
  surfaceInset: "#122031"
  surfaceHover: "#293E54"
  surfaceTint: "#19354B"
  ink: "#EEF4FC"
  muted: "#B6C5D7"
  subtle: "#A6B9CD"
  signal: "#66DFC2"
  blue: "#9BC2FF"
  coral: "#FFAC94"
  violet: "#B4BBFF"
  mint: "#87E2B6"
  warning: "#F6CB85"
  line: "#30465E"
  lineStrong: "#58718D"
  scrollbar: "#496582"
  scrollbarHover: "#6F91B5"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
  mono:
    fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace"
rounded:
  DEFAULT: "0.75rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.125rem"
spacing:
  section-gap: "2rem"
  page-gutter: "20px"
  page-gutter-mobile: "16px"
components:
  button: { rounded: "0.75rem", height: "2.75rem" }
  card: { rounded: "1.125rem" }
  dialog: { rounded: "1rem" }
  table: { height: "4.5rem" }
---

# KontrolPR Design System

## Overview

### Creative North Star

KontrolPR is a daily review desk beside the editor: midnight-blue surfaces, sapphire actions and visible mint, coral and amber accents. It should be lively and recognizable while remaining easy to scan. On 2026-10-22 the user rejected both the earlier electric-lime direction and its overly desaturated graphite/petroleum replacement. The latest correction explicitly restores color, icons and animation; “not AI-looking” must not be interpreted as gray, monochrome or motionless.

### Product context and register

- **Audience and primary job:** Developers, QA and observers need to understand review ownership and the most recent meaningful change at a glance.
- **Target market(s) and evidence:** Internal Kontroller / Erobot workflow; repositories are configured for the `kontroller_test` workspace.
- **Locale(s) and language policy:** User interface is Spanish. Source identifiers, logs and API models are English.
- **Usage scene:** Frequent desktop scanning with short mobile checks; high information density, but each row must preserve one clear next action.
- **Register:** Product surface with an expressive operational identity.
- **Memorable signature:** Four colored summary cards, filled icon tiles, identity avatars and spring-like switches on a deep blue desk.
- **Restraint:** Keep dense table backgrounds dark; badges, avatars and freshness rails provide color without compromising long-comment reading.
- **Anti-references:** No acid-lime CTA, ambient neon glows, purple/cyan gradients, faux terminal decoration or oversized marketing-style dashboard cards. An all-gray interface is also explicitly rejected.
- **Token ownership/runtime mapping:** This document owns visual intent and token values; `src/index.css` is the runtime adapter. Drift is checked by comparing the variables in that file to this document during review.

## Colors

Deep blue surfaces carry the interface. `primary` is sapphire for solid actions with dark `onPrimary` text; `signal` is bright mint for focus, selected navigation and freshness. `blue` identifies information and effective updates, `coral` identifies feedback/exclusions, `mint` identifies approval and `warning` is amber for pending attention. `violet` is a soft periwinkle identity accent, never a gradient. Text and borders use common tokens rather than per-screen literals.

Configuration and ignored navigation retain the individual `--tone` of each section, including on mobile; no global selection override flattens them to one accent. Summary cards use a colored top rail, solid icon tile, colored count and 11% tinted body (16% on hover). Avatars use stable identity colors with a 20% fill; shared panel and repository icons use 19–20% fills. Status badges use a 14% tint plus text and a dot. Switches use an 82% active track. Existing `tone-lime` resolves to mint `signal`; `tone-violet` resolves to periwinkle. Color always accompanies a label, icon or state semantics.

The existing runtime adapter remains `src/index.css`: DESIGN.md records accepted values, one root custom-property block implements them, and components consume those properties. Camel-case color names map to kebab-case variables (`surfaceInset` → `--surface-inset`, `primaryHover` → `--primary-hover`, `onPrimary` → `--on-primary`, `lineStrong` → `--line-strong`, `scrollbarHover` → `--scrollbar-hover`); all other color names map directly. `rounded.xl` maps to `--panel-radius`. The favicon mirrors `primary`/`onPrimary`, and the HTML browser-chrome color mirrors `background`; palette tests check these small static adapters for drift.

## Typography

Inter or the system sans stack carries Spanish interface copy with stable metrics. The mono stack is reserved for repository names, branch names, PR identifiers and timestamps. Sentence case is the default. Numeric summaries use tabular figures where supported.

## Layout

The shell uses a compact 204px desktop rail and a utility-sized header: a 17px “Monitor de PR” title, search and sync actions, with a small second-line sync status. Desktop content begins 24px below the header. The authenticated header and content fill the entire available width beside the rail, without a centered maximum-width cap; Resumen, Ignorados and every settings section share this geometry. Horizontal gutters are 20px on desktop and 16px at widths up to 820px. `spacing.page-gutter` maps to the root `--page-gutter` in `src/index.css`, consumed by `.topbar` and `.content-wrap`; the mobile media query overrides it using `spacing.page-gutter-mobile`. Below 820px, the title is omitted beside the existing brand bar; primary navigation is fixed at the bottom with safe-area padding, labeled icons and 44px touch targets in a 53px bar. Content reserves space below its last control for that navigation. Configuration sections form one horizontally scrollable, single-row navigation strip instead of occupying two mobile rows. Desktop uses a table surface; small phones use stacked cards without horizontal page scrolling. Readable text measures, the sign-in width and detail drawer dimensions remain independent of this wider authenticated shell.

This shell is authenticated-only. Without a verified session, `SignInView` presents a naturally scrolling access page capped at 1120px with the existing brand, connection form and permission guidance. The connection card owns the sole page heading, without a duplicated introductory block; no sidebar, bottom navigation, search, notifications, PR counts or settings tabs appear. Session recovery has a dedicated status panel rather than exposing account content early. There is no runtime demo dataset or anonymous reviewer identity.

## Elevation & Depth

Hierarchy comes from blue `surface`, `surfaceInset` and `surfaceRaised` layers, colored component fills and one-pixel borders. No decorative gradients or neon glows are used. The only gradient is the neutral loading shimmer. Small shadows support lifted summary cards, primary-button hover, overlays and the switch thumb. The detail drawer dims the app with a solid translucent layer and never changes the page layout.

## Shapes

Rounded rectangles use the medium radius for familiar controls and large radius for primary panels. Dividers are thin and quiet. Status markers are small circles or short rails; pills are reserved for compact state labels.

## Components

### Foundational visual states

Focus is a 2px signal outline with a 3px offset. Hover lifts interactive cards and buttons by 1–3px and adds a stronger tonal edge. Disabled controls reduce contrast but remain legible. Busy controls keep their width and expose `aria-busy`. Errors are inline and persistent; transient sync feedback uses the shared live status region.

### Buttons and actions

The primary button uses `onPrimary` text on `primary`, changing to `primaryHover` on hover. Neutral actions are outlined. Hover lifts the button 2px with a small icon tilt; a 1px press movement acknowledges activation. Summary icons tilt gently and their arrows move on hover. Refresh is an icon-plus-label action on desktop and an icon button with an accessible label on compact widths. Observer surfaces do not render workflow mutation controls.

### Navigation and data display

The left rail names the role and the operational view. The primary table shows repository, PR, owner, flow status, latest activity and age. Mobile cards keep repository/PR, flow status and next owner in the first viewport.

### Forms and overlays

Search fields have an explicit clear button. Header search displays a non-interactive `kbd` hint reading `Ctrl + K` for the team's Windows workflow, with `Ctrl + Alt + K` documented as an alternative. Shortcut activation focuses/selects the field and opens Resumen; no fake Mac shortcut or global printable-key shortcut is shown. Summary filters share `FilterPopover`: portaled disclosure panels, 160ms opening/closing motion, outside-pointer/focus dismissal and Escape restoration. Single-value filters use native radios inside a fieldset, not a custom ARIA listbox. Their panels match the trigger width and flip above it when necessary. MultiSelect uses the same panel with search, identity avatars, multiple switches and a selected count; its panel may widen to 300px for readable names, clamped to the viewport. The developer directory retains its native repository select. Configuration sections separate Connection, Repositories, Developers and Notifications. Notifications group unread activity by PR and use a quiet empty bell when there are no unread items.

Boolean controls use `components/ui/Switch.tsx`: a 46 × 44px keyboard-operable switch button, a rounded 24px track, a white thumb with a check when on, and restrained spring-like translation. Role selection uses native radio inputs inside full-card labels. Initials use a stable per-identity avatar color; for four-part display names the abbreviation uses the first word and penultimate word (e.g. Diego Gustavo Cuevas Montes → DC). Abbreviations never participate in identity matching.

Connection is a split surface with a personal login form and a tinted read-permission panel; connected state shows a verified identity avatar. Token instructions use a keyboard-operable disclosure below the read permissions and link directly to Atlassian account security. Local credential retention and fixed 12-hour session expiry are explained honestly. Repository entries have individual icon tiles and a distinct add-repository composer, always above the repository list in document and keyboard order. Developer entries alternate neutral rows, include identity avatars and repository scope, and distinguish informational QA badges from per-repository following switches. Notification preferences use icon cards and an explicit preview action. Settings surfaces use `--panel-radius: 18px`, with 12–17px inner surfaces and no gradient fills. The decorative second ring around the permission icon is removed.

Sign-in requires an explicit QA/developer/observer choice through the shared perspective radio cards; none is selected implicitly. Login cards are compact and stack into horizontal rows on phones. The chosen perspective is stored under the verified account and restored with its valid session. Connected settings continue to allow changing perspective. Disconnect/expiry returns to the same sign-in page with no previous identity or data on screen.

Ignored has two independent list surfaces: explicit PR exclusions and developer exclusions. Each has an icon, count, search and pagination. Excluding a developer never populates the PR exclusion list. Existing exclusions remain restorable when their remote entity is absent from the current dataset.

The tracking detail reuses the existing modal drawer and adds a colored next-owner panel, icon-labeled metadata cards and an event timeline with separate commit, comment and approval tones. Each timeline card preserves full comment/message text and dates; commits expose the actual message and a linked short hash. Mentions are rendered as text chips with a resolved display name, never as injected remote HTML. Unresolved mentions are labeled “Usuario de Bitbucket” rather than exposing a raw account identifier. Motion is limited to panel/card entry and follows reduced-motion preferences. A compact, 44px-target navigation row offers previous/next within the list that opened the detail, position and manual refresh. Background sync updates the open PR without remounting the dialog; close restores the original trigger. Evidence copy distinguishes verified content changes, current approval and inconclusive comparison, never correctness of a fix.

The developer section separates local following switches from shared team identity. QA membership is an arbitrary-length shared list, including zero QA, with no named slots or fixed quota. Only the API-verified sole editor sees the blue-toned composer and Remove/Undo controls; everyone can read and refresh the same list. A lock icon and Spanish explanation make the restriction clear; selecting the QA perspective never grants authority. The composer reuses `PersonSelect`, `FilterPopover`, native radios, search and avatars. Add/Remove await confirmed server persistence, disable duplicate submissions, report conflict/error states and preserve the last verified list on refresh failure. Undo adds the removed person to the current verified revision, never blindly restores an old whole roster. Names, avatars and available aliases identify people visually; raw IDs and the former JSON export are never rendered. The QA list stays bounded to 360px. The native repository filter, directory pagination, source labels and following rules remain unchanged. This authorized persistence change preserves the established palette, typography, radii and reduced-motion behavior; see the shared-team decision in `docs/DECISIONS.md`.

The following directory separates identity, repository and controls into three desktop columns and naturally stacked mobile rows. Every row names its configured repository with a blue Lucide folder, visible label and full workspace/slug, including workspace-only members. Its header counts unique people, not person/repository combinations. Raw account IDs stay out of these rows and the QA identity workflow. Workspace-only rows carry an amber unverified-access caption and explain why following is unavailable instead of leaving an unexplained blank action area. This clarification preserves the existing native repository filter, pagination, tokens and role rules.

`EmptyState` owns a gently floating icon and sparse signal dots; `TableSkeleton` owns matching avatar, text and switch placeholders with a 1.8s shimmer. Skeletons are bound to actual initial load, never an artificial delay, and retain a semantic status label. Refreshing an existing list keeps its rows visible. All motion is disabled under reduced-motion preferences, and switches preserve system contrast under forced colors.

### Synchronization and updates

Synchronization uses a compact shared `SyncProgress` surface above the active view: a blue icon tile, elapsed seconds, real page/repository/PR counts and a mint native progress bar. The bar is indeterminate until the total is known, with no invented percentage or time estimate. Existing content stays readable during background refresh. `UpdateNotice` is a persistent, keyboard-operable, non-modal banner at bottom right on desktop and above mobile navigation. It reuses shared buttons and tokens, never activates a waiting version without the update action, and does not steal focus. Reduced-motion disables the indeterminate pulse. These additions retain the existing palette and typography.

`SyncStatus` owns the compact header status and adds a blue clock with the actual next scheduler deadline, formatted in the browser's local time. It wraps naturally on phones without increasing header padding, hides the deadline during a query and distinguishes “Próximo intento” after an error. With no repositories it explains the pause instead of showing a fabricated successful query. Summary cards expose their saved selected state with `aria-pressed`, the existing tone border and a stronger tonal fill, without changing palette or geometry.

### Iconography

Lucide React, 1.75px stroke, 16–20px sizes. Icons support labels and never carry meaning alone.

### Motion

Resumen reuses the settings panel's 240ms `panel-appear` fade and 5px upward entry. Its wrapper mounts on view entry, not on filter, search, loading or sync changes. Reduced-motion disables this entry animation entirely.

Motion supports sync, panel transitions and responsive interaction feedback, with 160–220ms ease-out timing and a 280ms spring-like switch translation. `prefers-reduced-motion` removes decorative animations and hover/press transforms; switch position still communicates its checked state without animation.

### Content and data visualization

Spanish copy is direct and operational: “Requiere QA”, “Esperando al desarrollador”, “Sincronizar ahora”. Dates use the user’s locale and source timestamps are never reinterpreted as local wall-clock data in domain logic.

## Do's and Don'ts

- **Do:** Make the next owner obvious in every PR row.
- **Do:** Keep flow state separate from “nuevo en este dispositivo”.
- **Don't:** Use `updated_on` alone to claim that code changed.
- **Don't:** imply frontend roles are Bitbucket security boundaries.
