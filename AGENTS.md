# AGENTS.md

## Cursor Cloud specific instructions

This is a React + TypeScript workout tracker app built with Vite.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Dev server | `npm run dev` | 5173 | Vite with HMR; use `--host 0.0.0.0` for cloud VM access |

### Key commands

See `package.json` scripts. Summary:

- **Dev server**: `npm run dev` (or `npx vite --host 0.0.0.0` in cloud VMs)
- **Lint**: `npm run lint`
- **Test**: `npm test` (Vitest, runs once) / `npm run test:watch` (watch mode)
- **Build**: `npm run build` (TypeScript check + Vite production build)

### Non-obvious notes

- Tests use `jsdom` environment via Vitest. The setup file at `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` matchers.
- When running the dev server in a cloud VM, always pass `--host 0.0.0.0` so it binds to all interfaces.
