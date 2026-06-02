# pgweb Solid frontend

SolidJS frontend for pgweb.
Legacy visual style preserved via existing `static/css/bootstrap.css`, `static/css/font-awesome.css`, and `static/css/app.css`.

## Commands

```bash
make frontend-dev
make frontend-build
```

## Dev flow

1. Start pgweb backend on `http://127.0.0.1:8081`
2. Run `make frontend-dev`
3. Open Vite URL

Vite proxies `/api/*` to pgweb backend.

## Production build

`make frontend-build`

Build output goes to `static/dist/`.
Root app now serves Solid frontend.
Legacy jQuery frontend kept at:

- `/static/legacy.html`

## Current implemented slices

- app bootstrap from `/api/info` and `/api/connection`
- prefix-aware API path builder
- session bootstrap from `?session=...`
- light/dark/auto theme toggle using legacy pgweb styling
- connection modal
- bookmark/manual/SSH connection form
- disconnect action
- schema/object browser with filter
- database switcher
- selected object summary
- table info fetch for tables/views/materialized views
- Ace SQL editor wrapper
- run / explain / analyze query flows
- query export JSON/CSV/XML
- local query templates
- rows browser with filtering, sorting, pagination
- structure / indexes / constraints views
- history / activity / connection views
- database stats / server settings shortcuts
- SQL dump + table export actions
- content modal for cell inspection

## Notes

- Asset base uses relative paths.
- API base derived from current URL path, supports pgweb prefix.
- Session bootstrap preserves `?session=...` behavior.
- Legacy jQuery frontend preserved for comparison/review.
