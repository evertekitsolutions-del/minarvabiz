# MINARVA BIZ — Architecture

## Goals
- Single codebase for Online, Offline (Windows), Hybrid
- Maximum shared business logic and UI
- Production-grade security, licensing, data integrity
- Offline-first reliability for desktop

## Shared Packages
ui · types · validation · business-logic · billing · licensing · sync · utils · database

## Edition Behaviour
| Concern | Online | Offline | Hybrid |
|---------|--------|---------|--------|
| Primary store | Supabase Postgres | SQLite | SQLite |
| Auth | Supabase Auth | Local JWT + bcrypt | Both |
| License | Online + cached | Offline signature + grace | Both |
| Sync | N/A | N/A | Outbox + conflict queue |

## Licensing
Ed25519 signed tokens, machine fingerprint binding, offline grace period, separate License Admin panel.

## Sync (Hybrid)
Outbox pattern, UUID + version idempotency, financial conflict review queue.
