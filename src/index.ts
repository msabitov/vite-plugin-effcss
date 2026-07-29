/**
 * effcss-vite-plugin — Vite plugin for EffCSS CSS-in-TS
 *
 * Captures EffCSS-generated CSS via Vite SSR pipeline and inlines it into HTML.
 * Works in both dev and build modes with zero additional dependencies.
 * Zero-config — just add it to your plugins array.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import react from '@vitejs/plugin-react';
 * import effcss from 'vite-plugin-effcss';
 *
 * export default defineConfig({
 *   plugins: [react(), effcss()],
 * });
 * ```
 */
import { effcssPlugin } from './plugin.js';

export default effcssPlugin;