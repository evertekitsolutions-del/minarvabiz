# Legacy JSON database IPC disabled

The renderer no longer exposes the legacy `db:read` / `db:write` JSON database API.

SQLite (`minarvabiz.db`) is the sole renderer persistence path for the offline desktop application.

The legacy main-process handlers remain temporarily for compatibility with older packaged clients and are not reachable through the current preload bridge. They must not be used for business data persistence.
