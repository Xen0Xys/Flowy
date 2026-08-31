# Contributing to Flowy

Thanks for taking the time to look into contributing. This guide covers how to set up your environment, the conventions we follow and how to get a change merged. [AGENTS.md](./AGENTS.md) holds the exhaustive rule set used by automated tooling and reviewers; this file is the human-oriented summary.

## Getting started

Prerequisites and the full local setup live in the [README](./README.md#development). In short:

- Bun 1.3.x, Node 20+
- Docker and Docker Compose v2 (optional but recommended)
- PostgreSQL if you run the backend without Docker

Fork the repository, clone your fork, then from the repo root:

```bash
bun install
cp server/.env.example server/.env
cp web/.env.example web/.env
```

## Development workflow

- Branch off `main` with a descriptive name (`feature/...`, `fix/...`, `docs/...`).
- Keep pull requests focused. One concern per PR.
- Run the app locally before pushing (see the README for the full setup).
- Add or update tests when behavior changes.

## Coding conventions

### Tooling

Linting and formatting are enforced with oxlint and oxfmt at the repository root:

- `bun run lint` runs both in check mode
- `bun run lint:fix` applies auto-fixes and formatting

Both must be green before opening a pull request.

### Style overview

- TypeScript everywhere. Explicit types on function signatures.
- No `console.log` in committed code. Use the Nest `Logger` on the backend.
- Frontend: `<script setup lang="ts">`, Tailwind utilities merged through `cn()`, shadcn-vue components stay untouched (add new ones with `bunx shadcn-vue@latest add <name>`).
- Backend: DTOs validated with `class-validator`, entities serialize with `@Exclude` for sensitive fields, errors thrown via Nest HTTP exceptions.
- Prisma: run `bunx prisma format` after schema edits, migrations named with a timestamp prefix, use `PrismaService.withTx()` for multi-step operations.

For the full rule set, see [AGENTS.md](./AGENTS.md).

## Tests

- `bun test` runs the full suite
- `bun test path/to/file.test.ts` isolates a single file
- Backend integration tests hit a real PostgreSQL instance, not mocks

## Commits

Commit messages follow the gitmoji convention:

```
<gitmoji> Short imperative summary
```

Examples:

- `:sparkles: Add recurring transactions endpoint`
- `:bug: Fix balance rounding on credit accounts`
- `:memo: Update deployment guide for Coolify`
- `:art: Refactor CategoryCombobox to use shared wrapper`

Keep each commit focused on a single concern. Clean up noisy history before opening a pull request.

## Pull requests

- Reference the related issue if any.
- Describe what changed and why. Include screenshots for UI changes.
- List the checks you ran (lint, tests, manual verification).
- Make sure CI is green before requesting review.

For security vulnerabilities, do not open a public issue or pull request. See [SECURITY.md](./SECURITY.md) for the private disclosure process.

## License

Flowy is released under CC-BY-NC-SA 4.0. By contributing, you agree that your contributions are licensed under the same terms. See [LICENSE](./LICENSE).
