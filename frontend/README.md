# Frontend build

Run `npm ci --prefix frontend` and `npm run build --prefix frontend` from the repository root, then `npm test`.

Edit the root JavaScript sources and `frontend/tailwind.config.cjs`. Do not edit `assets/` by hand. Commit generated assets together with their source changes: GitHub Pages serves these files directly, and CI checks reproducibility.

`build.cjs` keeps global names because inline handlers use them. It emits a smaller initial script and two optional chunks for secondary views and dialogs. Update the explicit function lists when moving an entry point. Chunk URLs, document URLs and the service-worker cache version must be bumped together when releasing an incompatible build.

Tailwind scans source templates rather than generated files. Keep utility classes as complete strings so they can be discovered at build time; add a safelist when a utility genuinely must be constructed dynamically.
