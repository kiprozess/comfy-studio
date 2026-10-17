# Deployment and security notes

This is a hackathon prototype without accounts or a password gate. It is intended for local use with your own Comfy workspace key. A reachable deployment lets anyone use its shared submission quota. No authentication is implied by Origin checks or signed job tickets.

## Secrets and image data

Keep `COMFY_API_KEY` in `.env.local` or the deployment's secret environment. Never put it in `.env.example`, frontend variables, screenshots, commits or issue reports. The example contains an empty value. If a real key has been shared, replace it in the Comfy workspace; removing a file value does not revoke a key.

Images are validated and normalized on the server, then sent to Comfy and the selected model provider. The application does not persist image data on its server. Browser history and saved references use IndexedDB. Provider retention and service terms are separate from this application's storage.

## Shared paid-request budget

All paid POST routes call `consumeSubmissionBudget` before reading uploads or contacting a provider: `/api/generate`, `/api/flatlay`, `/api/pose` and `/api/upscale`, including the optional Cloud workflow. Job-ticket validation still protects status/results; polling does not consume the submission quota.

In production, `APP_RATE_LIMIT_DIR` is required and must be an absolute, persistent, writable directory outside `public/`. Defaults are 6 attempts per minute and 50 per fixed 24-hour window. Override them with positive integer `APP_REQUESTS_PER_MINUTE` / `APP_REQUESTS_PER_DAY` values (1–999999). Local development skips quotas unless a directory is explicitly configured.

Minute and day counters use fixed windows starting with the first accepted attempt. A new window can allow another full quota immediately after the previous boundary; these are not rolling-window limits. The counters are shared across modes, clients and idempotency keys. They are not keyed by forwarded IP headers. State is written via atomic rename under an exclusive directory lock, so restarts and concurrent processes cannot silently reset the quota when using the same persistent directory. Corrupt/unavailable state and lock contention return 503; an exhausted window returns 429 with `Retry-After`. Invalid submissions and retries also consume attempts. Counts limit requests, not actual spend; set a workspace spending limit independently.

Every replica must share the same filesystem and preserve it across deployments, with atomic mkdir/rename semantics. Separate or ephemeral filesystems provide separate budgets and are unsuitable for a public instance. Serverless deployments need a replacement shared limiter. Users can exhaust the global quota and deny service to other users; this is an intentional limit, not access control. The development server binds to 127.0.0.1 by default.

If a process crashes while holding `submission.lock`, subsequent submissions remain blocked. Stop/drain all app processes, verify none is writing the counters, remove only that lock directory, then restart. Keep `submission.json` to preserve the budget; deleting the counter state resets it. Do not automatically expire locks while requests may still be running.

## Dependency audit

As checked on 2026-10-17, `npm audit` reports one advisory affecting five packages in the development-only Next.js ESLint dependency chain: `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces@3.0.3`.

The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns stack exhaustion while parsing deeply nested brace patterns. npm currently lists no patched braces version. In this repository that parser is part of local lint tooling; API upload/reference data is not used as a lint glob. `npm audit --omit=dev` reports no known production findings. This is a scoped exposure assessment, not a claim that the advisory is fixed.

Do not run `npm audit fix --force`: its proposed downgrade of eslint-config-next is incompatible with the installed Next.js major version. Keep the Next.js-specific lint rules, lint only trusted checkouts/configuration, and recheck for an upstream fix before release. Do not suppress the advisory or edit vendored dependencies to make the audit appear clean.

## Before hosting a public demo

- Use HTTPS and a private persistent volume for quota state.
- Set provider spending limits and monitor provider costs/errors.
- Review image/likeness rights before publishing examples.
- Decide whether you need authenticated access and distributed abuse controls beyond this prototype.
- Run `npm test`, `npm run lint`, `npm run build` and `npm audit`.

For a suspected issue, contact the repository maintainer privately through their GitHub profile; do not include API keys or other people's photos in public issues.
