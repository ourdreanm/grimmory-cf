# Deployment trigger

The legacy Pages catch-all route `functions/api/file/[...key].ts` has been removed. The supported file endpoint is `functions/api/file.ts` using `?key=`.

This commit intentionally triggers a fresh Cloudflare Pages Git deployment from the current `main` branch.
