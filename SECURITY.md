# Security Policy

Flowy handles financial data. If you find a security vulnerability, we take it seriously and appreciate a responsible disclosure.

## Supported versions

Flowy is a self-hosted application under active development. Security fixes are applied to:

- The latest release
- The `main` branch

Older releases are not maintained. Please upgrade before reporting.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting to disclose the issue:

1. Go to the [Security tab](https://github.com/Xen0Xys/Flowy/security) of this repository
2. Click "Report a vulnerability"
3. Provide a clear description, steps to reproduce, affected version and impact

Do not open a public issue for security vulnerabilities.

If GitHub advisories are unavailable to you, email [contact@dotslash.fr](mailto:contact@dotslash.fr) instead.

## What to expect

- Acknowledgement within 5 business days
- Initial assessment and severity classification within 10 business days
- Coordinated disclosure once a fix is available

Timelines are best-effort. Flowy is an open-source project maintained without paid support.

## Scope

In scope:

- Flowy backend (NestJS + Prisma)
- Flowy frontend (Nuxt)
- Docker images and Compose files shipped in this repository

Out of scope:

- Vulnerabilities in third-party services you connect to (banks, aggregators)
- Misconfigurations of your own infrastructure (reverse proxy, TLS, firewall, database exposure)
- Social engineering or physical attacks

## Handling of financial data

By design, Flowy stores financial data in your own PostgreSQL instance. The project does not receive or process any user data. Security fixes therefore focus on the code you deploy.
