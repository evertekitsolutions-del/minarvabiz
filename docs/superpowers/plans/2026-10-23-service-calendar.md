# Service visit calendar export implementation plan

Goal: export the existing technician/day itinerary as a portable offline iCalendar file (SVC-004/SVC-013).
Architecture: retain the authorized visit reader and route grouping; add a pure calendar serializer and a per-day download action. Reuse ISC-licensed ics format-text at be80affe735f1c97d2c5e2801a9a4f826ff4b631 with notice. No runtime dependencies, network transport or persistence changes.

- [x] Test all-day/exclusive end dates, stable UID, closed-visit exclusion, Unicode byte folding, injection resistance, invalid/duplicate/foreign visits and no private evidence leakage.
- [x] Vendor the upstream text escaping helper with CR normalization; implement a bounded single technician/day serializer with UTF-8 folding.
- [x] Connect an explicit download action that re-reads authorized visits at click time, handles errors and cleans up its Blob URL.
- [x] Run targeted suites and package typechecks; record limits.
- [ ] Push and open a source PR (automatic approval review blocked push). Merge only if required exact-head checks pass.

Scope: read-only calendar snapshot. No invitation, automatic sync, cancellation propagation or new visit times. Preserve Online/Offline/Hybrid permission boundaries. Do not claim full product completion, deployed UAT or installer release.
