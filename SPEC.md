# Specification: `@cmfcmf/docusaurus-search-local`

Status: **fork of v2.0.1** — local/offline search plugin for Docusaurus v3.

## 0. Fork identity

- This repository is a **fork of `cmfcmf/docusaurus-search-local` v2.0.1**
  maintained at **`https://github.com/mlengse/docusaurus-search-local`**
  (git remote `origin`; the original is remote `upstream`).
- The npm package name `@cmfcmf/docusaurus-search-local` and the version
  (`2.0.1`) are **kept unchanged** for drop-in compatibility; the npm
  namespace is the upstream author's.
- `author` is updated to `mLengse (medotsys@gmail.com)`. The `repository`
  field in `packages/docusaurus-search-local/package.json` points at
  `mlengse/docusaurus-search-local`.
- Fork-specific deltas vs upstream:
  - Vendored `src/lunr.js` replaced by the `github:mlengse/lunr.js` fork
    (lunr 2.3.9).
  - `lunr-languages` moved from `^1.4.0` (npm) to the
    `github:mlengse/lunr-languages` fork, which bundles `@node-rs/jieba`
    (WASM) for Chinese tokenization.
  - `tokenize` for scalar `zh` uses `lunr.zh.tokenizer` (jieba/`Intl.Segmenter`)
    instead of the upstream whitespace split, and `lunr.tokenizerSeparator`
    is rejected for `zh`/`ja`/`th`.
  - Server tests migrated to TypeScript; client unit tests added
    (`index.test.tsx`, `HighlightSearchResults.test.tsx`); jest split into
    `server`/`client` projects.
  - Per-file and per-locale read failures are caught and skipped instead of
    aborting the build.

## 1. Overview

Fully client-side search plugin. The index is built at Docusaurus build time
(server-side) and shipped as static JSON; at runtime the browser fetches the
index and performs all search/queries locally. No external search service is
required.

- Indexing: [lunr.js](https://lunrjs.com/) (v2.3.9, `mlengse/lunr.js` fork).
- Tokenizers/stemmers: `mlengse/lunr-languages` fork (uses `@node-rs/jieba`
  for `zh`).
- UI: [Algolia Autocomplete](https://www.algolia.com/doc/ui-libraries/autocomplete/)
  (`@algolia/autocomplete-js`) with a React renderer.
- Highlighting: [mark.js](https://markjs.io/).

## 2. Repository layout (monorepo)

- `packages/docusaurus-search-local` — the plugin (name `@cmfcmf/...`).
- `packages/example-docs` — test site used by Playwright E2E tests.
- Tooling: `pnpm` workspace + `turbo`; `jest` (server + client projects),
  `playwright` (E2E), `prettier` (formatting), `syncpack` (dependency
  mismatch checks), `commitlint` + `husky` (commit message linting).
- `.github/workflows`: `main.yml` (CI matrix: OS × Node 20/22/24 × React
  18/19 × Docusaurus 3.7–3.9), `publish.yml` (npm publish via OIDC),
  `results.yml` (test-results check), `commitlint.yml`.
- `patches/` — `pnpm` `patchedDependencies` for `@algolia/autocomplete-js`,
  `@slorber/react-helmet-async`, `@types/mdx`,
  `@types/react-router-config`, `prism-react-renderer`.

## 3. Architecture

### 3.1 Server (build time, Node)

| Lifecycle hook                      | Responsibility                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateOptions`                   | Validates plugin options against a Joi schema (`src/server/index.ts`).                                                                                                                                                                                                     |
| `configureWebpack`                  | Prepends a loader (`lunr-generator.js`) that emits the generated client module `d-s-l-a-generated.js` (contains `tokenize` and `mylunr`).                                                                                                                                  |
| `getDefaultCodeTranslationMessages` | Loads UI translations for the current locale; missing/malformed files fall through to the next locale and finally return `{}`.                                                                                                                                             |
| `contentLoaded`                     | Publishes global plugin data (`titleBoost`, `contentBoost`, `tagsBoost`, `parentCategoriesBoost`, `indexDocSidebarParentCategories`, `maxSearchResults`).                                                                                                                  |
| `postBuild`                         | Parses built HTML (`src/server/parse.ts`), segments documents per `docusaurusTag` (version/locale), builds one lunr index per tag, writes `search-index-<tag>.json` to `outDir`. A single unreadable/malformed HTML file is logged and skipped; it never aborts the build. |

Key helpers: `urlMatchesPrefix`, `trimLeadingSlash`, `trimTrailingSlash`,
`codeTranslationLocalesToTry` (`src/server/index.ts`).

### 3.2 Client (runtime, browser)

- `src/client/theme/SearchBar/index.tsx` — Autocomplete integration:
  - index cache per tag with a shared loading state (multiple concurrent
    consumers are resolved/rejected together; fetch failures reject all
    waiters). Fetch is only attempted when `NODE_ENV === "production"`;
    otherwise a dummy empty index is used.
  - query pipeline: tokenize input → lunr query over `title`/`content`/`tags`
    (+ optional `sidebarParentCategories`) with configured boosts and trailing
    wildcards → rank by score → cap at `maxSearchResults`.
  - navigation pushes `{ cmfcmfhighlight: { terms, isDocsOrBlog } }` in history
    state.
- `src/client/theme/SearchBar/HighlightSearchResults.tsx` — on navigation with
  `cmfcmfhighlight` state, marks matching terms via mark.js inside
  `<article>` (docs/blog) or `<main>` (other pages), then clears the state from
  the URL so the highlight is not re-applied on refresh.
- `d-s-l-a-generated.js` — generated per build; exports `tokenize` and `mylunr`.

### 3.3 Search index format

`search-index-<tag>.json` = `{ documents: MyDocument[], index: lunr-serialized }`.
`MyDocument`: `{ id, pageTitle, sectionTitle, sectionRoute, type }`.
`id` is the lunr `ref`; `type` is `docs` | `blog` | `page`.

## 4. Options (validated by Joi)

| Option                               | Type               | Default | Notes                                           |
| ------------------------------------ | ------------------ | ------- | ----------------------------------------------- |
| `indexDocs`                          | boolean            | `true`  |                                                 |
| `indexDocSidebarParentCategories`    | integer ≥ 0        | `0`     | 0 disables the `sidebarParentCategories` field. |
| `includeParentCategoriesInPageTitle` | boolean            | `false` |                                                 |
| `indexBlog`                          | boolean            | `true`  |                                                 |
| `indexPages`                         | boolean            | `false` |                                                 |
| `language`                           | string \| string[] | `"en"`  | See §5.                                         |
| `style`                              | `"none"`           | —       | disables bundled styles.                        |
| `maxSearchResults`                   | integer ≥ 1        | `8`     |                                                 |
| `lunr.tokenizerSeparator`            | RegExp             | —       | Rejected for `zh`, `ja`, `th`.                  |
| `lunr.b`                             | number 0–1         | `0.75`  | BM25 field-length normalization.                |
| `lunr.k1`                            | number ≥ 0         | `1.2`   | BM25 term-frequency saturation.                 |
| `lunr.titleBoost`                    | number ≥ 0         | `5`     |                                                 |
| `lunr.contentBoost`                  | number ≥ 0         | `1`     |                                                 |
| `lunr.tagsBoost`                     | number ≥ 0         | `3`     |                                                 |
| `lunr.parentCategoriesBoost`         | number ≥ 0         | `2`     |                                                 |

## 5. Language support

`language` accepts: `ar, da, de, en, es, fi, fr, hi, hu, it, ja, nl, no, pt, ro,
ru, sv, th, tr, vi, zh` (single or array). An array of length 1 is collapsed to
the scalar form.

Tokenizer strategy:

| Language             | Client `tokenize`                                   | Notes                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `en`                 | `lunr.tokenizer`                                    | default.                                                                                                                                                                                                           |
| `zh`                 | `lunr.zh.tokenizer`                                 | Uses `@node-rs/jieba` (WASM, bundled via `mlengse/lunr-languages`) on the server and falls back to `Intl.Segmenter` in the browser. No native compilation; no `nodejieba` required. `tokenizerSeparator` rejected. |
| `ja`                 | `lunr.ja.tokenizer` (via `tinyseg`)                 | `tokenizerSeparator` rejected.                                                                                                                                                                                     |
| `th`, `hi`           | `lunr.<code>.tokenizer` (via `wordcut`)             | `tokenizerSeparator` rejected for `th`; honored for `hi`.                                                                                                                                                          |
| multi-language array | union of `lunr.tokenizer` + each language tokenizer | Mirrors `lunr.multiLanguage`, so CJK queries (`zh`/`ja`/`th`) are segmented like the indexed documents. `tokenizerSeparator` honored (applied to the default tokenizer).                                           |

For a scalar language, `tokenize` is
`input => <lang>.tokenizer(input).map(token => token.str)` (for `th`, the
wordcut tokenizer returns raw strings, so `.str` is omitted).

For a multi-language array, the generated client module captures the default
`lunr.tokenizer`, replaces `lunr.tokenizer` with a union function that appends
each `lunr.<code>.tokenizer`'s tokens (deduped via a `seen` set, mirroring
`lunr.multiLanguage`), and preserves `lunr.tokenizer.separator` on the union so
the default splitter keeps working. `tokenize` guards for raw-string tokenizers
(`th`/`hi`): `token => typeof token === "string" ? token : token.str`.

## 6. Security posture

- Dangerous functions (`eval`, `innerHTML`, `document.write`, …): **0** in
  production code. (`innerHTML` appears only in a jest/jsdom test to set up
  fixtures.)
- Hardcoded secrets / sensitive files: **0**; `.env`-style files are
  gitignored.
- `process.env` usage limited to `DEBUG` (logger), `CI` (playwright config),
  `NODE_ENV` (index availability).
- File reads are guarded per file (`postBuild`) and per locale
  (`getDefaultCodeTranslationMessages`) with try/catch; failures are logged and
  skipped.
- No `console.log` leaks; no `any` in production code (test-only `as any`);
  no `@ts-expect-error`, `@ts-ignore`, `FIXME`, or `TODO` markers remain in
  `src/`.
- The index filename `search-index-<docusaurusTag>.json` derives `docusaurusTag`
  from an HTML `<meta>` tag. The tag is sanitized before use: characters outside
  `[A-Za-z0-9._-]` are stripped, leading/trailing `.`/`-` are removed, and an
  empty result falls back to `default` (a warning is logged if the tag was
  altered). The HTML is the site's own build output, so this is defense-in-depth
  (see §9).

## 7. Quality gates

- **TypeScript**: `tsc -p tsconfig.server.json` and `tsc -p tsconfig.client.json`
  both pass with `strict` mode; `noUnusedLocals`/`noImplicitReturns`/
  `noUnusedParameters` enabled.
- **Formatting**: `prettier --check` clean.
- **Dependency consistency**: `syncpack list-mismatches` clean.
- **Unit tests** (`jest src`): 6 suites, 65 tests, all passing with a local
  `example-docs/build` present:
  - `server/index.test.ts`, `server/parse.test.ts`,
    `server/generated-client-module.test.ts`
  - `client/.../SearchBar/__tests__/index.test.tsx`,
    `client/.../SearchBar/__tests__/HighlightSearchResults.test.tsx`,
    `client/.../SearchBar/__tests__/RootReuse.test.tsx`
- **Coverage thresholds**: enforced (40% lines / 30% branches per project,
  `jest.config.js`) via `pnpm --filter docusaurus-search-local run
test:coverage`; measured 47% lines / 44% branches overall (see §9).
- **E2E** (`pnpm test:e2e`): 7 Playwright tests (basic search, version-aware
  index, language-specific index, dark-mode sync, blog search, no-results
  empty state, static-page search).

### 7.1 Test suites at a glance

| Suite                                        | Cases | Covers                                                                                                                                                           |
| -------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/index.test.ts`                       | 24    | `validateOptions`, `urlMatchesPrefix`, `trimLeadingSlash`, `trimTrailingSlash`, `codeTranslationLocalesToTry`, `sanitizeDocusaurusTag`.                          |
| `server/parse.test.ts`                       | 21    | `html2text`, `getDocusaurusTag`. 11 cases require the example site to be built (`example-docs/build`) and only fail locally when it is missing.                  |
| `server/generated-client-module.test.ts`     | 6     | `generateClientModule` output via a subprocess harness: CJK array/latin tokenization, scalar `zh`, `de`+`en`, `tokenizerSeparator`, `mylunr`/`tokenize` exports. |
| `client/.../index.test.tsx`                  | 4     | `fetchIndex` behavior (404, invalid JSON, valid index, network error).                                                                                           |
| `client/.../HighlightSearchResults.test.tsx` | 7     | mark/unmark on `<article>` & `<main>`, state cleanup, missing-root no-op, unmount cleanup.                                                                       |
| `client/.../RootReuse.test.tsx`              | 3     | `createRoot` reuse per container, distinct containers, unmount cleanup.                                                                                          |

## 8. Compatibility

- Node ≥ 20 (relies on `Intl.Segmenter` for the `zh` browser fallback and
  `Intl.Locale` for translation fallback). `.nvmrc` = `20`.
- Docusaurus ≥ 3; React 18/19; lunr fork `mlengse/lunr.js` (2.3.9);
  lunr-languages fork `mlengse/lunr-languages`.
- Chinese (`zh`) does **not** require installing `nodejieba`; the
  `@node-rs/jieba` WASM tokenizer ships with the lunr-languages fork. The
  stale `nodejieba` references were removed from `package.json`/`README.md`
  (Phase 1 of the cleanup plan).
- Search works only on statically built output (`docusaurus build`); in
  development a dummy empty index is used.

## 9. Known issues / technical debt (audit findings)

1. ~~**Stale `nodejieba` references.**~~ **Resolved (Phase 1).** `package.json`
   declared `nodejieba` as an optional peer dependency and a dev dependency,
   and `README.md` instructed users to install it for `zh`. The fork's Chinese
   tokenizer actually uses `@node-rs/jieba` (bundled with
   `mlengse/lunr-languages`); all references were removed from
   `package.json`, `README.md`, and the lockfile.
2. ~~**Unused runtime dependencies.**~~ **Resolved (Phase 2).** `algoliasearch`
   and `@algolia/client-search` were listed in the plugin's `dependencies`
   (and `@algolia/client-search` in `example-docs`) but never imported;
   removed from both `package.json` files and the lockfile.
3. ~~**Stale `repository` field.**~~ **Resolved (Phase 1).** The plugin
   `package.json` `repository` now reads `mlengse/docusaurus-search-local`,
   matching the README badges and `commitlint.config.mjs` help URL.
4. ~~**CJK in multi-language arrays** is not segmented on the query side.~~
   **Resolved (Phase 3.1).** The generated client module now emits a union
   tokenizer mirroring `lunr.multiLanguage`, so `["zh","en"]`, `["ja", …]`, and
   `["th", …]` segment CJK queries like the indexed documents; the
   `lunr.tokenizer.separator` is preserved on the union. See §5.
5. ~~**Coverage thresholds are dead config**~~ **Resolved (Phase 4.1).**
   `jest.config.js` sets thresholds per project (40% lines / 30% branches) and
   they are now enforced: a `test:coverage` script was added to the plugin
   `package.json`, and `.github/workflows/main.yml` runs it after the build
   (parse tests need `example-docs/build`). Measured overall coverage at
   Phase 4.1: 47.27% lines / 43.98% branches (server 48.23%/47.87%,
   client 45.38%/30.18%).
6. ~~**`@docusaurus/utils-validation` is a devDependency**~~ **Resolved
   (Phase 2).** It is required at runtime by `src/server/index.ts` (Joi) and
   is now a regular `dependency` (`catalog:3.9.2`) instead of a
   devDependency, which is correct under strict pnpm node-linker.
7. ~~**`createRoot(container)` is called on every Autocomplete render**~~
   **Resolved (Phase 3.2).** `index.tsx` now caches the root per panel
   container in a `Map` ref (`rootsRef`) and reuses it across renders, so the
   React 18/19 "container was previously passed to createRoot" warning and the
   root leak are gone. Roots are intentionally not unmounted in the effect
   cleanup: React 19 throws on a synchronous cross-root unmount during a
   component's unmount commit; autocomplete recreates its panel element per
   instance, so the cached roots are simply abandoned and the map cleared.
8. ~~**`docusaurusTag` is not sanitized**~~ **Resolved (Phase 3.3).** A
   `sanitizeDocusaurusTag` helper strips unsafe filename characters, trims
   leading/trailing `.`/`-`, falls back to `default`, and logs a warning when
   altered. It is applied when grouping documents by tag in `postBuild`, so the
   filename is always safe.
9. ~~**`.prettierignore` lists a non-existent `lunr.js`**~~ **Resolved
   (Phase 1).** entry removed (the vendored file was removed in the fork).
