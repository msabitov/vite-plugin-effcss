/**
 * effcss-vite-plugin — Shared types
 */

/**
 * Plugin options. All optional — works zero-config.
 */
export interface EffcssPluginOptions {
  /**
   * Explicit entry point for CSS capture (e.g. '/src/main.tsx').
   * If not provided, detected from index.html's first <script type="module"> src.
   */
  entry?: string;

  /** Verbose logging. @default false */
  verbose?: boolean;

  /**
   * HTML placeholder to replace with `<style>`.
   * @default '<!-- EFFCSS_INJECT -->'
   */
  placeholder?: string;

  /**
   * Where to inject `<style>` if placeholder not found.
   * @default 'head'
   */
  injectTo?: 'head' | 'head-prepend';
}

/** Default plugin options. */
export const DEFAULTS: Required<Omit<EffcssPluginOptions, 'entry'>> & { entry?: string } = {
  verbose: false,
  placeholder: '<!-- EFFCSS_INJECT -->',
  injectTo: 'head'
};