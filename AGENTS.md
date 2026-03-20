# AGENTS GUIDE FOR FLOWY

1. PURPOSE — This document defines the baseline expectations for all agentic contributors working inside this repository.
2. SCOPE — Applies to the entire repo unless a nested AGENTS.md overrides part of it.
3. CONTACT — If automation cannot proceed (missing secret, failing env), leave a clear TODO in your summary.
4. LICENSE — This project ships under CC-BY-NC-ND; keep third-party code compliant.
5. CURSOR / COPILOT RULES — None detected (.cursor/ and .github/copilot-instructions.md absent); keep this section updated if that changes.
6. TOOLCHAIN DEFAULTS — Use Bun 1.3.x and Node 20+; prefer Bun for scripts already defined with `bun`.
7. PACKAGE MANAGERS — Do not mix npm/pnpm/yarn within the same workspace; `bun install` at repo root installs everything.
8. MONOREPO LAYOUT — `web/` hosts the Nuxt frontend, `server/` contains the Nest backend, and shared configs live at root.
9. WORKSPACES — The root `package.json` defines workspaces as `./*`; so `bun install` at root triggers hoisted installs for both subprojects.
10. ENV FILES — Never commit .env artifacts; Prisma + Nest rely on `DATABASE_URL`, `APP_SECRET`, `APP_NAME`, and optionally `PREFIX`.
11. GIT HYGIENE — Keep commits focused per task; do not amend someone else’s commits.
12. SECRET MATERIAL — Prisma migrations may expose private schema; double-check before sharing logs.
13. ISSUE REPRODUCTION — Capture reproduction instructions in final summaries when triaging bugs.
14. DIRECTORY CREATION — Use project-relative paths; windows path separators are accepted but prefer POSIX-style for docs.
15. SCRIPTS — Run scripts from within their folder unless explicitly documented below.

## BUILD / LINT / TEST COMMANDS

16. ROOT INSTALL — `bun install` (runs workspace-aware install for frontend and backend).
17. ROOT LINT CHECK — `bun run lint` (executes `oxlint .` followed by `prettier --check .`).
18. ROOT LINT FIX — `bun run lint:fix` (runs `oxlint --fix` then `prettier --write`).
19. ROOT TEST SUITE — `bun test` (Bun’s built-in test runner; respects `bunfig.toml` if present).
20. SINGLE TEST FILE — `bun test path/to/file.test.ts` (replace with the relative file you want to isolate).
21. WATCHING TESTS — `bun test --watch path/to/file.test.ts` will re-run on file changes.
22. FRONTEND DEV — From `web/`: `bun run dev` for Nuxt dev server (Vite under the hood).
23. FRONTEND BUILD — `bun run build` (emits `.output/` for deployment).
24. FRONTEND PREVIEW — `bun run preview` to serve the production build locally.
25. FRONTEND GENERATE — `bun run generate` for static output; respects Nuxt route rules.
26. FRONTEND PREPARE — `bun run postinstall` triggers `nuxt prepare` (already executed automatically; rerun if modules change).
27. BACKEND DEV — From `server/`: `bun run dev` (Fastify host with hot reload).
28. BACKEND BUILD — `bun run build` (invokes `bun build.ts`, output in `dist/`).
29. BACKEND START DEV — `bun run start` (alias for Nest fastify start; ensure `DATABASE_URL` exists).
30. BACKEND START PROD — `bun run start:prod` (executes compiled `dist/app`).
31. PRISMA GENERATE — `bunx prisma generate` inside `server/` to refresh the client after schema edits.
32. PRISMA MIGRATE DEV — `bunx prisma migrate dev --name <label>` while pointing to a local Postgres database.
33. PRISMA MIGRATE DEPLOY — `bunx prisma migrate deploy` (used automatically by Docker entrypoint before seeding).
34. PRISMA STUDIO — `bunx prisma studio` for manual DB inspection (only when safe).
35. DATABASE SEED — `bunx prisma db seed` runs `server/prisma/seed.ts`.
36. DOCKER FRONTEND — `docker build -f web/Dockerfile -t flowy-nuxt web`.
37. DOCKER BACKEND — `docker build -f server/Dockerfile -t flowy-nest server` (needs `DATABASE_URL` build-arg value).
38. LOGGING — Backend logs with Nest’s Logger plus custom Prisma query timing; keep log noise low in commits.

## CODE STYLE BASELINE

39. FORMATTING OWNER — Prettier config at root controls everything (4 spaces, double quotes, trailing commas, compact brackets).
40. PRETTIER INVOCATION — Use `bunx prettier --write <globs>` for manual formatting.
41. OXLINT — Primary linting surface; do not disable rules without justification in PR descriptions.
42. IMPORT ORDER — Group by standard libs, third-party packages, then local aliases; leave a blank line between groups.
43. TYPE MODULES — Root `tsconfig.json` sets `module` to `NodeNext`; prefer ES module syntax everywhere.
44. TYPES FIRST — Always type function parameters and return values when non-trivial; rely on inference only for obvious cases.
45. NAMING — Classes and decorators use PascalCase, functions camelCase, constants UPPER_SNAKE_CASE when exported.
46. ENUMS — Favor string unions for small sets; prefer Prisma enums when data-backed.
47. FILE SCOPES — One component/class per file unless a helper is co-located intentionally (document reasons in comments/docstrings).
48. ERROR HANDLING — Bubble Nest exceptions via built-in HTTP exception classes; avoid `any` catches, instead narrow error types.
49. LOGGING FAILURES — Use Nest `Logger` or `LoggerMiddleware` helpers; never `console.log` in committed code.
50. NULLISH CASES — Use `??` to set defaults over `||` unless falsey values are acceptable.
51. TEMP FILES — Delete `.tmp`, `.log`, and `.DS_Store` artifacts before finishing work.

## FRONTEND (NUXT 4)

52. ENTRY — Core app located in `web/app/`; Global layout resides in `web/app/app.vue` with `<NuxtLayout>` usage.
53. COMPONENT PLACEMENT — UI components belong under `web/app/components/ui/`; follow shadcn-vue scaffolding. Do not edit shadcn-vue files. Use `bunx shadcn-vue@latest add <component>` to add new ones.
54. SCRIPT SETUP — Prefer `<script setup lang="ts">`; avoid Options API unless migration requires it.
55. TYPES — Use `defineProps`/`withDefaults` for prop typing; export shared types via `*.ts` modules inside component directories.
56. STYLING — Tailwind is primary; utility combos should go through `cn()` from `web/app/lib/utils.ts` to deduplicate classes; prefer padding, flex, and grid for spacing and avoid margins unless a layout truly needs them.

57. VARIANTS — Build component variants using `class-variance-authority` like `buttonVariants`; keep tokens consistent with Tailwind palette.
58. ICONS — Use `@nuxt/icon` or `lucide-vue-next`; ensure icons are tree-shakeable.
59. STATE — Prefer Nuxt composables (`useState`, `useFetch`) or VueUse utilities; avoid global mutable singletons.
60. SSR SAFETY — When accessing `window`, guard with `if (process.client)`; plugin example `plugins/ssr-width.ts` shows server-safe setup.
61. ROUTING — Pages live under `web/app/pages/`; route naming follows file path conventions. Keep default layout lean.
62. FORMS — Use `<form>` with native validation where possible; for advanced validation integrate vee-validate or zod-late as needed.
63. TESTING (FRONTEND) — When adding tests, prefer Vitest via Bun once configured; align directories under `web/tests/` or alongside components.
64. ACCESSIBILITY — Buttons always expose `aria` props; ensure focus-visible styles align with Prettier class wrapping.

## BACKEND (NEST FASTIFY)

66. ENTRY — `server/src/app.ts` bootstraps the Fastify adapter plus Swagger. Keep modifications localized via helper functions.
67. GLOBAL PIPES — `CustomValidationPipe` already registered; reuse for DTO validation across modules.
68. NEST MODULES — Each domain module belongs under `server/src/modules/<domain>` with `module`, `controller`, `service`, `dto`, `entity` folders.
69. DEPENDENCY INJECTION — Always register providers in the module decorator and inject via constructor parameters.
70. CONTROLLERS — Attach explicit route prefixes (`@Controller('user')`). Keep handler methods typed and decorated (e.g., `@Post`, `@Body`).
71. DTO DESIGN — Compose DTOs using `class-validator` decorators plus `@ApiProperty` (add when Swagger coverage is required).
72. ENTITIES — Serialize responses via entity classes that hide sensitive fields with `@Exclude`.
73. SERVICES — Keep services side-effect free beyond DB operations; use `PrismaService.withTx()` when participating in transactions.
74. PRISMA SERVICE — Query logging is automatic; avoid noisy loops around Prisma operations to keep logs readable.
75. ERROR STRATEGY — Translate invariants into `BadRequestException`, `ConflictException`, etc. Never leak raw database errors to clients.
76. THROTTLING — Respect `ThrottlerModule` configuration (60 requests/min). For higher-volume endpoints, override via `@SkipThrottle()` or custom options.
77. SCHEDULING — `ScheduleModule` is available for cronjobs; prefer `@Cron` decorators inside dedicated services rather than controllers.
78. AUTH — JWT module is globally configured; keep tokens signed with HS512 per `AppModule` to remain compatible.
79. CORS — Already set to `*`; if constraints change, update `loadServer` and document the new policy here.
80. FASTIFY PLUGINS — Register new plugins near `loadServer` with proper configuration; avoid Express-only middleware.

## DATABASE & PRISMA

81. SCHEMA LOCATION — `server/prisma/schema.prisma`; run `bunx prisma format` after edits to keep layout canonical.
82. CLIENT OUTPUT — Generated client under `server/prisma/generated`; never edit generated files manually.
83. MIGRATION NAMING — Use timestamps plus concise description (e.g., `20260114_add_transactions`).
84. ENV VARS — Prisma reads `DATABASE_URL` from `.env` or environment; keep credentials out of git.
85. LOGGING — Prisma extension logs `<model> <operation> <duration>`; use this to detect N+1 issues.
86. CONSTRAINTS — Use database-level unique indexes for any field validated in code (email, jwt_id, etc.).
87. SEED DATA — `prisma/seed.ts` should remain idempotent; prefer `upsert` instead of blind `create` when possible.
88. TRANSACTIONS — Wrap multi-step operations with `prisma.$transaction` or `PrismaService.withTx()`.
89. TYPE SAFETY — Prefer Prisma-generated types (`Users`, `UserRoles`) over hand-rolled interfaces.

## ERROR HANDLING & LOGGING

90. FRONTEND — Surface user-friendly toasts/dialogs; avoid leaking stack traces. Use Nuxt error boundary for fatal errors.
91. BACKEND — Throw Nest HTTP exceptions; set helpful messages but omit sensitive info (passwords, tokens, SQL).
92. LOG LEVELS — Use `Logger.log` for success, `Logger.warn` for slow ops, `Logger.error` for failures.
93. VALIDATION — Always validate incoming payloads through DTO + pipes; never trust raw `any` input.
94. EDGE CASES — Consider concurrency when generating IDs (e.g., `crypto.randomBytes` for JWT IDs already safe).
95. RETRIES — For external IO (email, queue), wrap with retry/backoff; log after final failure.

## IMPORTS & MODULE RESOLUTION

96. MONOREPO IMPORTS — Use relative paths unless aliased; frontend aliases configured via `components.json` and Nuxt.
97. BACKEND PATHS — Stick to relative imports (e.g., `../../../prisma/generated/client`) unless tsconfig path mapping is introduced.
98. STYLE — No wildcard (`*`) imports unless module legitimately exports a namespace.
99. SIDE EFFECTS — Side-effect imports (polyfills, env config) should be isolated in entry files.
100.    TREE SHAKING — Keep exports explicit so bundlers (Nuxt, Bun build) can drop unused code.

## TYPES & STRICTNESS

101. STRICTNESS — Server tsconfig enables `strictNullChecks`; treat `undefined` cases explicitly.
102. ANY USAGE — If `any` is unavoidable, wrap it in a helper type and document why.

103. LITERALS — Use `as const` for discriminated unions where helpful (e.g., button variant tables).
104. DOM TYPES — Import from `vue`/`reka-ui` for prop typing rather than relying on ambient globals.

## NAMING & STRUCTURE

106. FILE NAMES — Kebab-case for Vue files (`Button.vue` exceptions as PascalCase for component directories). TypeScript helpers snake? prefer kebab/pascal consistent.
107. DIRECTORIES — Keep `index.ts` as re-export aggregator when directory holds multiple related exports.
108. TEST FILES — Name as `<feature>.test.ts` near the implementation or under `tests/feature/`.
109. ENV FILES — Name `.env.local`, `.env.test`, `.env.production`. Never commit them.
110. COMMITS — Summaries should describe intent (“add user registration dto validation”).

## ERROR REPORTING & OBSERVABILITY

111. HEALTH CHECK — Expose `/version` (already implemented). Extend with `/healthz` if infra requires.
112. RATE LIMITS — Respect configured throttler; for open endpoints consider stronger limits or captcha.
113. AUDIT — Log successful admin actions (user creation, config changes) at INFO level.

## PULL REQUEST EXPECTATIONS

116. CHECKLIST — Run lint + tests locally before requesting review.
117. DIFF SIZE — Keep PRs scoped; large rewrites need RFC-style context.
118. REVIEW NOTES — Reference this AGENTS guide when justifying choices.
119. CI FRIENDLINESS — Assume CI executes `bun install`, `bun run lint`, `bun test`, then targeted builds; keep these passing.
120. DOCUMENTATION — Update this file when process or tooling changes.

## CONTRIBUTION PROCESS

121. Issue triage should confirm environment readiness before coding.
122. Start by reading open TODOs in code comments.
123. Prefer feature flags for risky backend changes.
124. Keep migrations backward compatible until deployments confirm new schema.
125. Validate incoming data again client-side for UX but treat server validation as the source of truth.
126. Write meaningful docstrings for exported helpers.
127. Remove dead code; don’t comment-out large blocks.
128. Keep dependencies minimal; justify every new package in PR description.
129. Prefer Bun-native APIs (e.g., `Bun.env`) only when cross-env parity is guaranteed.
130. Never store raw passwords; delegate to hashing helpers (bcrypt/argon) before persistence.
131. When writing new middleware, make it stateless and reusable.
132. Cache configuration in memory only if invalidation strategy is defined.
133. Document new environment variables inside `README` or here.
134. Include reproduction steps for bugfix PRs.
135. Always describe failure/success cases in final summaries.
136. If tests are flaky, mark them skipped only with linked tracking issue.
137. Keep Dockerfiles synchronized with script changes.
138. Avoid absolute Windows-only paths in code; rely on `path.resolve`.
139. Leverage `package.json` `postinstall` scripts for workspace bootstrap tasks.
140. When editing this AGENTS guide, maintain ~150-line length and update section numbers if new sections are inserted.
141. Ensure numbering stays sequential to keep quick reference easy.
142. When adding new frameworks/tools, add their commands + conventions to relevant sections.
143. If Cursor/Copilot rules appear later, summarize and link them in Section 5.
144. Every agent should skim this file before running destructive commands.
145. Prefer descriptive branch names (`feature/user-onboarding`).
146. Keep this document in sync with actual scripts; stale instructions slow everyone down.
147. Treat AGENTS.md as the single source of truth for automation guidelines.
148. Celebrate small wins: mention completed tasks in your final assistant message.
149. Leave breadcrumbs — reference updated files and commands in summaries.
150. Thanks for keeping Flowy tidy and predictable.

## QUALITY & COMMITS

151. FEATURE TESTING — Validate every change you ship with the most relevant checks (focused unit tests, `bun test`, targeted `bun run build`, manual UX walkthrough, `docker compose` smoke test, etc.) and mention those results in your summary.
152. TEST REPORTING — If a required check cannot run, explain the reason, list the pending command(s), and note any manual validation performed.
153. GITMOJI COMMITS — Prefix every commit message with a gitmoji (e.g., `:sparkles:`) followed by a concise intent description.
154. COMMIT FORMAT — Use `<gitmoji> short description` and keep each commit focused on a single concern.
