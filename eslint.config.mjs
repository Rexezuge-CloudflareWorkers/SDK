// The kit's own lint gate, wired like AWS-AccessBridge's `eslint.config.mjs`
// but through the converged factory this repo ships: the plugin stack and
// the rule reasons live in `@rexezuge/tooling`, so this file is only the
// scope and the boundaries that are specific to the kit's own layout.
//
// Canonical `projectDirs` do not apply here — the worker repos' layers
// (`backend-data`, `provider-clients`, …) do not exist in this tree — so
// only `packages/shared` is inherited from the canonical table and every
// other kit boundary is an `extraLayers` entry below. Each entry flows to
// both the static `no-restricted-imports` rule and the dynamic-`import()`
// `no-restricted-syntax` guard, same as in consumers.
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineRepoLintConfig } from '@rexezuge/tooling/eslint';

const SCOPE = '@rexezuge';
const at = (name) => `${SCOPE}/${name}`;
const ANY = `${SCOPE}/*`;

// `hono` and `chanfana` live in `@rexezuge/http` and nowhere else: every
// package except `http` gets this ban, so a server-framework type leaking
// out of the one package allowed to hold it fails the gate at the import.
const FRAMEWORK_DIRS = [
  'packages/errors',
  'packages/shared',
  'packages/runtime',
  'packages/i18n',
  'packages/d1',
  'packages/identity',
  'packages/web',
  'packages/tooling',
  'codemods',
];

export default [
  ...defineRepoLintConfig({
    scope: SCOPE,
    projectDirs: ['packages/shared'],
    extraIgnores: ['packages/*/dist/**'],
    extraLayers: [
      {
        dir: 'packages/errors',
        ban: [ANY],
        message: 'errors must not import from other @rexezuge packages — it is a zero-dependency base layer',
      },
      {
        dir: 'packages/runtime',
        ban: [ANY],
        message: 'runtime must not import from other @rexezuge packages — it is a zero-dependency base layer',
      },
      {
        dir: 'packages/i18n',
        ban: [ANY],
        message: 'i18n must not import from other @rexezuge packages — it is a zero-dependency base layer',
      },
      {
        dir: 'codemods',
        ban: [ANY],
        message: 'codemods must not import from @rexezuge packages — it ships mapping data, not kit code',
      },
      {
        dir: 'packages/d1',
        ban: [at('d1'), at('identity'), at('http'), at('web'), at('tooling'), at('runtime'), at('i18n')],
        message: 'd1 may only import errors and shared',
      },
      {
        dir: 'packages/identity',
        ban: [at('identity'), at('http'), at('web'), at('tooling'), at('runtime'), at('i18n')],
        message: 'identity may only import d1, errors and shared',
      },
      {
        dir: 'packages/http',
        ban: [at('d1'), at('identity'), at('http'), at('web'), at('tooling'), at('runtime'), at('i18n')],
        message: 'http may only import errors and shared',
      },
      {
        dir: 'packages/web',
        ban: [at('d1'), at('identity'), at('http'), at('web'), at('tooling'), at('runtime'), at('i18n')],
        message: 'web may only import errors and shared',
      },
      {
        dir: 'packages/tooling',
        ban: [at('errors'), at('shared'), at('runtime'), at('i18n'), at('identity'), at('http'), at('web'), at('tooling')],
        message: 'tooling must stay dependency-free except d1 (backup encryption)',
      },
      ...FRAMEWORK_DIRS.map((dir) => ({
        dir,
        ban: ['hono', 'chanfana'],
        message: 'hono and chanfana live in @rexezuge/http and nowhere else',
      })),
      {
        dir: 'packages/web',
        ban: ['react-i18next'],
        message: 'web components take labels as props, never useTranslation — do not add a react-i18next dependency',
      },
    ],
  }),

  // The UI kit runs under jsdom (see its vitest setup) and in browsers, so
  // `window` and `document` are environment, not undefined globals.
  {
    files: ['packages/web/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Rules of hooks for the UI kit — appended here rather than in the factory
  // because the kit stays zero-dependency and the plugin belongs to the app
  // that has JSX, the same split AWS-AccessBridge uses for its SPA.
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
];
