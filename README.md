# Stockyard

A desktop client for [Cloudflare D1](https://developers.cloudflare.com/d1/) databases. Connect
with a Cloudflare API token to browse your remote D1 databases, or point it at a local `wrangler`
project to work with its local D1 SQLite files.

Built with Electron, Vue 3, and TypeScript (electron-vite). API tokens are encrypted at rest using
the OS keychain/DPAPI via Electron `safeStorage` and never leave the main process.

## Features

- Connect via a Cloudflare API token (remote) or a local `wrangler` project folder
- Account → database → table navigation
- Paginated row browsing
- SQL console — reads render in the grid; writes/DDL require a confirmation step
- Row insert / edit / delete with a preview + confirm before any write
- Light / dark / auto theme and an adjustable interface size

## Project setup

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build:win    # Windows installer
npm run build:mac    # macOS
npm run build:linux  # Linux
```

### Checks

```bash
npm run lint
npm run typecheck
```
