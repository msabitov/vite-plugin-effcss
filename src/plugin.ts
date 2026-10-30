/**
 * effcss-vite-plugin — Vite plugin for EffCSS CSS-in-TS
 *
 * Strategy:
 * - Pure Vite SSR API: no esbuild, no tsx, no tmp files (build mode)
 * - Dev: write temp capture .ts → ViteDevServer.ssrLoadModule()
 * - Build: create temporary ViteDevServer → ssrLoadModule(virtual module)
 * - transformIndexHtml inlines captured <style>/<script> tags into HTML
 * - The real EffCSS runtime ships in the browser bundle for HMR/dynamic styles
 *
 * Zero-config: user configures EffCSS via configure() in their own code.
 */
import type { Plugin, PluginOption, ResolvedConfig, ViteDevServer, IndexHtmlTransformContext, IndexHtmlTransformResult } from 'vite';
import { createServer } from 'vite';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Buffer } from 'node:buffer';
import type { EffcssPluginOptions } from './types.js';
import { DEFAULTS } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Virtual capture module IDs (build mode only)
// ─────────────────────────────────────────────────────────────────────────────

const CAPTURE_MODULE_ID = 'effcss:capture';
const RESOLVED_CAPTURE_ID = '\0' + CAPTURE_MODULE_ID;
const PLUGIN_NAME = 'vite-plugin-effcss:inject';

// ─────────────────────────────────────────────────────────────────────────────
// Entry point discovery (fallback when options.entry is not set)
// ─────────────────────────────────────────────────────────────────────────────

function getEntryPointFromHtml(root: string): string | null {
  const htmlPath = resolve(root, 'index.html');
  if (!existsSync(htmlPath)) return null;
  const html = readFileSync(htmlPath, 'utf-8');
  const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/i);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture source builder
//
// Does NOT call configure() — the user configures EffCSS in their own source.
// Just imports EffCSS to ensure it's loaded, imports the entry point so all
// EffCSS files execute (registering styles), then calls serialize().
// ─────────────────────────────────────────────────────────────────────────────

function buildCaptureSource(entryPoint: string): string {
  return [
    `// effcss-vite-plugin: capture module`,
    `const __effcss = await import('effcss');`,
    `const __serialize = __effcss.serialize || __effcss.default?.serialize;`,
    `const __getContexts = __effcss.getContexts || __effcss.default?.getContexts;`,
    `try { await import(${JSON.stringify(entryPoint)}); } catch(__e) { /* expected: no DOM */ }`,
    ``,
    `export const css = typeof __serialize === 'function' ? __serialize() : '';`,
    `export const ctxCss = typeof __getContexts === 'function' ? Object.values(__getContexts()).map((ctx) => ctx.serialize()).join('') : '';`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture: Dev mode (existing ViteDevServer)
//
// Uses a temporary .ts file because ssrLoadModule with \0 virtual IDs can be
// unreliable across Vite versions in dev mode.
// ─────────────────────────────────────────────────────────────────────────────

async function captureViaDev(
  entryPoint: string,
  server: ViteDevServer,
  root: string,
  verbose: boolean,
): Promise<{ css: string; ctxCss: string }> {
  const source = buildCaptureSource(entryPoint);
  const nodeModulesDir = join(root, 'node_modules');
  if (!existsSync(nodeModulesDir)) mkdirSync(nodeModulesDir, { recursive: true });
  const tmpDir = mkdtempSync(join(nodeModulesDir, '.effcss-capture-'));
  const tmpFile = join(tmpDir, 'capture.ts');

  try {
    writeFileSync(tmpFile, source, 'utf-8');
    if (verbose) console.log('[effcss] Capturing via Vite SSR (dev)...');
    const mod = (await server.ssrLoadModule(tmpFile)) as Record<string, unknown>;
    return {
      css: (mod.css as string) || '',
      ctxCss: (mod.ctxCss as string) || '',
    };
  } finally {
    try { rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture: Build mode (temporary ViteDevServer)
//
// Creates a throwaway Vite dev server in middleware mode, registers a virtual
// capture module, loads it via ssrLoadModule, then closes the server.
//
// This plugin is excluded to prevent recursion.
// ─────────────────────────────────────────────────────────────────────────────

async function captureViaBuild(
  root: string,
  entryPoint: string,
  userPlugins: Plugin[],
  verbose: boolean,
): Promise<{ css: string; ctxCss: string }> {
  if (verbose) console.log('[effcss] Creating temporary Vite SSR server for capture...');

  const tempServer = await createServer({
    root,
    server: { middlewareMode: true },
    plugins: [
      // Mini plugin to provide the capture virtual module
      {
        name: 'effcss:capture-server',
        resolveId(id: string) {
          if (id === CAPTURE_MODULE_ID) return RESOLVED_CAPTURE_ID;
          return null;
        },
        load(id: string) {
          if (id === RESOLVED_CAPTURE_ID) {
            return buildCaptureSource(entryPoint);
          }
          return null;
        },
      } as Plugin,
      // Include user plugins (React, Vue, etc.) — they handle JSX, SVG, etc.
      // Exclude THIS plugin to prevent infinite recursion
      ...userPlugins.filter(p => p.name !== PLUGIN_NAME),
    ],
    configFile: false,
    logLevel: 'silent' as const,
  });

  try {
    if (verbose) console.log('[effcss] Capturing via Vite SSR (build)...');
    const mod = (await tempServer.ssrLoadModule(CAPTURE_MODULE_ID)) as Record<string, unknown>;
    return {
      css: (mod.css as string) || '',
      ctxCss: (mod.ctxCss as string) || '',
    };
  } finally {
    await tempServer.close();
    if (verbose) console.log('[effcss] Temporary Vite SSR server closed.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin factory — public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EffCSS Vite plugin
 */
export function effcssPlugin(options: EffcssPluginOptions = {}): PluginOption {
  const {
    verbose = DEFAULTS.verbose,
    placeholder = DEFAULTS.placeholder,
    injectTo = DEFAULTS.injectTo,
    entry: explicitEntry,
  } = options;

  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;
  let capturedCss = '';
  let capturedCtxCss = '';
  let captureError: string | null = null;

  return {
    name: PLUGIN_NAME,
    enforce: 'post',

    configResolved(resolvedConfig: ResolvedConfig) {
      config = resolvedConfig;
    },

    configureServer(devServer: ViteDevServer) {
      server = devServer;
    },

    async buildStart() {
      capturedCss = '';
      capturedCtxCss = '';
      captureError = null;

      try {
        // ── Resolve entry point ──────────────────────────────────────────
        let entryPoint: string | null = explicitEntry || null;
        if (!entryPoint) {
          const htmlEntry = getEntryPointFromHtml(config.root);
          if (!htmlEntry) {
            if (verbose) console.log('[effcss] No entry point — skipping capture.');
            return;
          }
          entryPoint = htmlEntry;
        }

        if (verbose) {
          console.log(`[effcss] Entry point: ${entryPoint}`);
        }

        let css: string;
        let ctxCss: string;

        if (server) {
          // ── Dev mode: use existing ViteDevServer ─────────────────────
          const result = await captureViaDev(entryPoint, server, config.root, verbose);
          css = result.css;
          ctxCss = result.ctxCss;
        } else {
          // ── Build mode: create temporary ViteDevServer ──────────────
          const result = await captureViaBuild(
            config.root,
            entryPoint,
            config.plugins as Plugin[],
            verbose,
          );
          css = result.css;
          ctxCss = result.ctxCss;
        }

        capturedCss = css;
        capturedCtxCss = ctxCss;

        if (verbose) {
          const size = Buffer.byteLength(capturedCss, 'utf-8');
          console.log(`[effcss] Captured ${size} bytes CSS.`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        captureError = `Failed to capture effcss: ${msg}`;
        console.warn(`[effcss] ${captureError}`);
      }
    },

    transformIndexHtml(html: string, _ctx: IndexHtmlTransformContext): string | IndexHtmlTransformResult | void | Promise<string | IndexHtmlTransformResult | void> {
      if (captureError) {
        console.warn(`[effcss] Skipping injection due to capture error: ${captureError}`);
        return html;
      }

      const injectParts: string[] = [];
      if (capturedCss) injectParts.push(capturedCss);
      if (capturedCtxCss) injectParts.push(capturedCtxCss);
      const injectContent = injectParts.join('\n');

      if (!injectContent) return html;

      // Try placeholder first
      if (html.includes(placeholder)) {
        if (verbose) console.log('[effcss] Replaced placeholder in HTML.');
        return html.replace(placeholder, injectContent);
      }

      // Fallback to injectTo position
      switch (injectTo) {
        case 'head-prepend':
          if (verbose) console.log('[effcss] Injecting into <head> (prepend).');
          return html.replace('<head>', `<head>\n${injectContent}`);
        case 'head':
        default:
          if (verbose) console.log('[effcss] Injecting before </head>.');
          return html.replace('</head>', `${injectContent}\n</head>`);
      }
    },
  };
}
