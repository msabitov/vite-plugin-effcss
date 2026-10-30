# vite-plugin-effcss

[![npm version](https://img.shields.io/npm/v/vite-plugin-effcss)](https://www.npmjs.com/package/vite-plugin-effcss)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Vite plugin for [EffCSS](https://effnd.tech/css/) — self-confident CSS-in-TS.

Captures EffCSS-generated CSS via **Vite SSR pipeline** and inlines it into HTML. It allows to eliminate FOUC and speed up the first rendering due to style hydration. Works in both dev and build modes with **zero additional dependencies** (no esbuild, no tsx, no extra loaders).

**Zero-config** — works with no options. Just add it to your plugins array.

> **CSR-focused** — for SSR/SSG, use manual `serialize()`. See [Server side rendering](https://effnd.tech/css/server/) for details.

---

## Requirements

- **Node.js** >= 18.0.0
- **Vite** ^5.0.0 || ^6.0.0
- **effcss** ^6.0.0 (⚠️ must be installed separately)

> **ESM-only** — this plugin (like EffCSS v6) ships ESM only. Use `import` (or a bundler that handles ESM). `require()` is not supported.

## Version compatibility

| Plugin version | effcss version | Notes |
|----------------|----------------|-------|
| `v2.x` | `^6.0.0` | Current. Uses `serialize()` + `getContexts()` / `ctx.serialize()` |
| `v1.x` | `^5.4.0` | Legacy. Uses `serialize()` + `serializeMeta()` |

> **Upgrading from v1.x to v2.x?** effcss v6 changed API. The plugin now captures both the global context and all isolated contexts. If you rely on the old serialization behaviour, stay on `vite-plugin-effcss@1` with `effcss@^5.4.0`.

## Installation

```bash
npm install vite-plugin-effcss --save-dev
```

> `EffCSS` is declared as a peer dependency — make sure it's installed in your project:
> ```bash
> npm install effcss
> ```

## Quick Start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import effcss from 'vite-plugin-effcss';

export default defineConfig({
  plugins: [react(), effcss()],
});
```

Add a placeholder in your HTML (optional — falls back to `</head>`):

```html
<head>
  <!-- EFFCSS_INJECT -->
</head>
```

That's it. The plugin captures all EffCSS-generated CSS and inlines it into your HTML.

## Options

All options are optional.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Verbose logging |
| `entry` | `string` | — | Explicit entry point (e.g. `/src/main.tsx`). Auto-detected from `<script type="module" src="...">` in `index.html` if omitted |
| `placeholder` | `string` | `'<!-- EFFCSS_INJECT -->'` | HTML placeholder to replace with `<style>` |
| `injectTo` | `'head' \| 'head-prepend' \| 'body'` | `'head'` | Fallback injection position if placeholder not found |

## License

Apache 2.0
