# Grimmory CF v2

Cloudflare-native Grimmory-style ebook, comic and audiobook library foundation.

## Stack
- Cloudflare Pages + Pages Functions
- Cloudflare D1
- Cloudflare R2
- Cookie sessions + PBKDF2 password hashing
- D1 FTS5 search

## Deploy with Cloudflare Pages Connect to Git
1. Create a D1 database named `grimmory-db` and copy its database ID into `wrangler.toml`.
2. Create an R2 bucket named `grimmory-books`.
3. Apply `migrations/0001_init.sql` to D1.
4. In Cloudflare Pages, Connect to Git and select this repository.
5. Build command: `npm install`; output directory: `public`.
6. Add Pages bindings `DB` (D1) and `BOOKS` (R2).
7. Add secret `SESSION_SECRET` with a long random value.

The first registered account becomes ADMIN. Large files should use direct/multipart R2 upload in v3.
