import fs from "fs";
import path from "path";
import type {
  LoadContext,
  LoadedPlugin,
  OptionValidationContext,
  Plugin,
} from "@docusaurus/types";
import type { LoadedContent as DocsLoadedContent } from "@docusaurus/plugin-content-docs";
import type { PluginOptions as DocsOptions } from "@docusaurus/plugin-content-docs";
import type { BlogContent as BlogLoadedContent } from "@docusaurus/plugin-content-blog";
import type { PluginOptions as BlogOptions } from "@docusaurus/plugin-content-blog";
import type { LoadedContent as PagesLoadedContent } from "@docusaurus/plugin-content-pages";
import type { PluginOptions as PagesOptions } from "@docusaurus/plugin-content-pages";
import { Joi } from "@docusaurus/utils-validation";
import type { DSLAPluginData, MyDocument } from "../types";
import { html2text, getDocusaurusTag } from "./parse";
import logger from "./logger";

type LunrLanguagePlugin = import("lunr").Builder.Plugin;

const lunr = require("lunr") as typeof import("lunr") & {
  // Members added at runtime by lunr-languages that are not part of the
  // official lunr typings.
  wordcut: (str: string) => string[];
  multiLanguage: (...languages: string[]) => LunrLanguagePlugin;
};

export function urlMatchesPrefix(url: string, prefix: string) {
  if (prefix.startsWith("/")) {
    throw new Error(
      `prefix must not start with a /. This is a bug (url: "${url}", prefix: ${prefix}).`,
    );
  }
  if (prefix.endsWith("/")) {
    throw new Error(
      `prefix must not end with a /. This is a bug (url: "${url}", prefix: ${prefix}).`,
    );
  }
  return prefix === "" || url === prefix || url.startsWith(`${prefix}/`);
}

export function trimLeadingSlash(path: string) {
  if (!path || !path.startsWith("/")) {
    return path;
  }
  return path.slice(1);
}

export function trimTrailingSlash(path: string) {
  if (!path || !path.endsWith("/")) {
    return path;
  }
  return path.slice(0, -1);
}

// Copied from Docusaurus, licensed under the MIT License.
// https://github.com/facebook/docusaurus/blob/63bd6b9025be282b50adbc65176598c96fd4f7e9/packages/docusaurus-theme-translations/src/index.ts#L20-L36
export function codeTranslationLocalesToTry(locale: string): string[] {
  const intlLocale = Intl.Locale ? new Intl.Locale(locale) : undefined;
  if (!intlLocale) {
    return [locale];
  }
  // if locale is just a simple language like "pt", we want to fallback to pt-BR (not pt-PT!)
  // see https://github.com/facebook/docusaurus/pull/4536#issuecomment-810088783
  if (intlLocale.language === locale) {
    const maximizedLocale = intlLocale.maximize(); // pt-Latn-BR`
    // ["pt","pt-BR"]
    return [locale, `${maximizedLocale.language}-${maximizedLocale.region}`];
  }
  // if locale is like "pt-BR", we want to fallback to "pt"
  else {
    return [locale, intlLocale.language!];
  }
}

// Docusaurus tags are used as part of the search index filename, so they must
// only contain characters that are safe on any file system. Docusaurus itself
// only emits tags matching [A-Za-z0-9._-] (e.g. `default`, `docs-default-1.0.0`),
// so this is defense-in-depth against malformed or malicious values.
export function sanitizeDocusaurusTag(tag: string): string {
  const sanitized = tag
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
  return sanitized || "default";
}

type MyOptions = {
  indexDocs: boolean;
  indexDocSidebarParentCategories: number;
  includeParentCategoriesInPageTitle: boolean;
  indexBlog: boolean;
  indexPages: boolean;
  language: string | string[];
  style?: "none";
  maxSearchResults: number;
  lunr: {
    tokenizerSeparator?: RegExp;
    k1: number;
    b: number;
    titleBoost: number;
    contentBoost: number;
    tagsBoost: number;
    parentCategoriesBoost: number;
  };
};

const languageSchema = Joi.string().valid(
  "ar",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "nl",
  "no",
  "pt",
  "ro",
  "ru",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
);

const optionsSchema = Joi.object({
  indexDocs: Joi.boolean().default(true),
  indexDocSidebarParentCategories: Joi.number()
    .integer()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),

  includeParentCategoriesInPageTitle: Joi.boolean().default(false),

  indexBlog: Joi.boolean().default(true),

  indexPages: Joi.boolean().default(false),

  language: Joi.alternatives(
    languageSchema,
    Joi.array().items(languageSchema),
  ).default("en"),

  style: Joi.string().valid("none"),

  maxSearchResults: Joi.number().integer().min(1).default(8),

  lunr: Joi.object({
    tokenizerSeparator: Joi.object().regex(),
    b: Joi.number().min(0).max(1).default(0.75),
    k1: Joi.number().min(0).default(1.2),
    titleBoost: Joi.number().min(0).default(5),
    contentBoost: Joi.number().min(0).default(1),
    tagsBoost: Joi.number().min(0).default(3),
    parentCategoriesBoost: Joi.number().min(0).default(2),
  }).default(),
});

// Emits the client-side multi-language tokenizer that mirrors the tokenizer
// used by lunr-languages' `lunr.multiLanguage` when building the index, so
// that queries are tokenized exactly like the indexed documents.
// https://github.com/mlengse/docusaurus-search-local/issues/85
function emitMultiLanguageTokenizer(codes: string[]): string {
  const codeList = codes.map((code) => JSON.stringify(code)).join(", ");
  return `\
lunr.tokenizer = (() => {
  const defaultTokenizer = lunr.tokenizer;
  const separator = lunr.tokenizer.separator;
  const multiTokenizer = (input) => {
    const tokens = defaultTokenizer(input);
    const seen = {};
    tokens.forEach((t) => { seen[t.toString()] = true; });
    [${codeList}].forEach((code) => {
      const language = lunr[code];
      if (language === undefined || typeof language.tokenizer === "undefined") return;
      language.tokenizer(input).forEach((token) => {
        const tokenString = token.toString();
        if (seen[tokenString]) return;
        seen[tokenString] = true;
        tokens.push(token);
      });
    });
    return tokens;
  };
  multiTokenizer.separator = separator;
  return multiTokenizer;
})();\n`;
}

export function generateClientModule(options: {
  style?: "none";
  language: string | string[];
  lunr: { tokenizerSeparator?: RegExp };
}): string {
  const {
    style,
    lunr: { tokenizerSeparator: lunrTokenizerSeparator },
  } = options;
  let { language } = options;

  if (Array.isArray(language) && language.length === 1) {
    language = language[0]!;
  }

  let generated =
    "// THIS FILE IS AUTOGENERATED\n" + "// DO NOT EDIT THIS FILE!\n\n";

  if (style !== "none") {
    generated += 'import "@algolia/autocomplete-theme-classic";\n';
    generated += 'import "./index.css";\n';
  }

  generated += 'const lunr = require("lunr");\n';

  function handleLangCode(code: string) {
    let generated = "";

    if (code === "jp") {
      throw new Error(`Language "jp" is deprecated, please use "ja".`);
    }

    if (code === "ja") {
      require("lunr-languages/tinyseg")(lunr);
      generated += `require("lunr-languages/tinyseg")(lunr);\n`;
    } else if (code === "th" || code === "hi") {
      lunr.wordcut = require("lunr-languages/wordcut");
      generated += `lunr.wordcut = require("lunr-languages/wordcut");\n`;
    }
    require(`lunr-languages/lunr.${code}`)(lunr);
    generated += `require("lunr-languages/lunr.${code}")(lunr);\n`;

    return generated;
  }

  if (language !== "en") {
    require("lunr-languages/lunr.stemmer.support")(lunr);
    generated += 'require("lunr-languages/lunr.stemmer.support")(lunr);\n';
    if (Array.isArray(language)) {
      language
        .filter((code) => code !== "en")
        .forEach((code) => {
          generated += handleLangCode(code);
        });
      require("lunr-languages/lunr.multi")(lunr);
      generated += `require("lunr-languages/lunr.multi")(lunr);\n`;
      generated += emitMultiLanguageTokenizer(
        language.filter((code) => code !== "en"),
      );
    } else {
      generated += handleLangCode(language);
    }
  }
  if (language === "zh") {
    if (lunrTokenizerSeparator) {
      throw new Error(
        "The lunr.tokenizerSeparator option is not supported for 'zh'",
      );
    }
    // The lunr-languages Chinese tokenizer uses @node-rs/jieba (WASM) on the
    // server and falls back to Intl.Segmenter in the browser, so it does not
    // require any native compilation and can safely be used client-side too.
    // https://github.com/mlengse/docusaurus-search-local/issues/85
    generated += `\
lunr.tokenizer = lunr.zh.tokenizer;\n\
export const tokenize = (input) => lunr.tokenizer(input).map((token) => token.str);\n`;
  } else if (language === "ja" || language === "th") {
    if (lunrTokenizerSeparator) {
      throw new Error(
        "The lunr.tokenizerSeparator option is not supported for 'ja' and 'th'",
      );
    }
    generated += `\
export const tokenize = (input) => lunr[${JSON.stringify(
      language,
    )}].tokenizer(input)
  .map(token => token${language === "th" ? "" : ".str"});\n`;
  } else {
    if (lunrTokenizerSeparator) {
      generated += `\
lunr.tokenizer.separator = ${lunrTokenizerSeparator.toString()};\n`;
    }
    generated += `\
export const tokenize = (input) => lunr.tokenizer(input)
  .map(token => typeof token === "string" ? token : token.str);\n`;
  }
  generated += `export const mylunr = lunr;\n`;

  return generated;
}

export default function cmfcmfDocusaurusSearchLocal(
  context: LoadContext,
  options: MyOptions,
): Plugin<unknown> {
  let {
    indexDocSidebarParentCategories,
    includeParentCategoriesInPageTitle,
    indexBlog,
    indexDocs,
    indexPages,
    language,
    style,
    maxSearchResults,
    lunr: {
      tokenizerSeparator: lunrTokenizerSeparator,
      k1,
      b,
      titleBoost,
      contentBoost,
      tagsBoost,
      parentCategoriesBoost,
    },
  } = options;

  if (Array.isArray(language) && language.length === 1) {
    language = language[0]!;
  }

  if (lunrTokenizerSeparator) {
    lunr.tokenizer.separator = lunrTokenizerSeparator;
  }

  const generated = generateClientModule({
    style,
    language,
    lunr: { tokenizerSeparator: lunrTokenizerSeparator },
  });

  return {
    name: "@cmfcmf/docusaurus-search-local",
    getThemePath() {
      return path.resolve(__dirname, "..", "..", "lib", "client", "theme");
    },
    getTypeScriptThemePath() {
      return path.resolve(__dirname, "..", "..", "src", "client", "theme");
    },
    getDefaultCodeTranslationMessages: async () => {
      const translationsDir = path.resolve(
        __dirname,
        "..",
        "..",
        "codeTranslations",
      );
      const localesToTry = codeTranslationLocalesToTry(
        context.i18n.currentLocale,
      );
      for (const locale of localesToTry) {
        const translationPath = path.join(translationsDir, `${locale}.json`);
        try {
          return JSON.parse(
            await fs.promises.readFile(translationPath, "utf8"),
          );
        } catch {
          // File does not exist or is malformed — try next locale.
        }
      }

      return {};
    },
    async contentLoaded({ actions: { setGlobalData } }) {
      const data: DSLAPluginData = {
        titleBoost,
        contentBoost,
        tagsBoost,
        parentCategoriesBoost,
        indexDocSidebarParentCategories,
        maxSearchResults,
      };
      setGlobalData(data);
    },
    async postBuild({
      routesPaths = [],
      outDir,
      baseUrl,
      siteConfig: { trailingSlash },
      plugins,
    }) {
      logger.info("Gathering documents");

      function buildPluginMap<Options, Content>(name: string) {
        return new Map(
          plugins
            .filter((plugin) => plugin.name === name)
            .map((plugin) => [plugin.options.id, plugin]) as Array<
            [string, LoadedPlugin & { content: Content; options: Options }]
          >,
        );
      }

      const docsPlugins = buildPluginMap<DocsOptions, DocsLoadedContent>(
        "docusaurus-plugin-content-docs",
      );
      const blogPlugins = buildPluginMap<BlogOptions, BlogLoadedContent>(
        "docusaurus-plugin-content-blog",
      );
      const pagesPlugins = buildPluginMap<PagesOptions, PagesLoadedContent>(
        "docusaurus-plugin-content-pages",
      );

      if (indexDocs && docsPlugins.size === 0) {
        throw new Error(
          'The "indexDocs" option is enabled but no docs plugin has been found.',
        );
      }
      if (indexBlog && blogPlugins.size === 0) {
        throw new Error(
          'The "indexBlog" option is enabled but no blog plugin has been found.',
        );
      }
      if (indexPages && pagesPlugins.size === 0) {
        throw new Error(
          'The "indexPages" option is enabled but no pages plugin has been found.',
        );
      }

      const data = routesPaths
        .flatMap((url) => {
          // baseUrl includes the language prefix, thus `route` will be language-agnostic.
          const route = url.substring(baseUrl.length);
          if (!url.startsWith(baseUrl)) {
            throw new Error(
              `The route must start with the baseUrl ${baseUrl}, but was ${route}. This is a bug, please report it.`,
            );
          }
          if (route === "404.html") {
            // Do not index error page.
            return [];
          }
          if (indexDocs) {
            for (const docsPlugin of docsPlugins.values()) {
              const docsBasePath = trimLeadingSlash(
                trimTrailingSlash(docsPlugin.options.routeBasePath),
              );
              const docsTagsPath = trimLeadingSlash(
                trimTrailingSlash(docsPlugin.options.tagsBasePath),
              );

              if (urlMatchesPrefix(route, docsBasePath)) {
                if (
                  urlMatchesPrefix(
                    route,
                    trimLeadingSlash(`${docsBasePath}/${docsTagsPath}`),
                  ) ||
                  urlMatchesPrefix(
                    route,
                    trimLeadingSlash(`${docsBasePath}/__docusaurus`),
                  )
                ) {
                  // Do not index tags filter pages and pages generated by the debug plugin
                  return [];
                }
                return {
                  route,
                  url,
                  type: "docs" as const,
                };
              }
            }
          }
          if (indexBlog) {
            for (const blogPlugin of blogPlugins.values()) {
              const blogBasePath = trimLeadingSlash(
                trimTrailingSlash(blogPlugin.options.routeBasePath),
              );
              const blogTagsPath = trimLeadingSlash(
                trimTrailingSlash(blogPlugin.options.tagsBasePath),
              );

              if (urlMatchesPrefix(route, blogBasePath)) {
                if (
                  route === blogBasePath ||
                  urlMatchesPrefix(
                    route,
                    trimLeadingSlash(`${blogBasePath}/${blogTagsPath}`),
                  ) ||
                  urlMatchesPrefix(
                    route,
                    trimLeadingSlash(`${blogBasePath}/__docusaurus`),
                  )
                ) {
                  // Do not index list of blog posts, tags filter pages, and pages generated by the debug plugin
                  return [];
                }
                return {
                  route,
                  url,
                  type: "blog" as const,
                };
              }
            }
          }
          if (indexPages) {
            for (const pagesPlugin of pagesPlugins.values()) {
              const pagesBasePath = trimLeadingSlash(
                trimTrailingSlash(pagesPlugin.options.routeBasePath),
              );

              if (urlMatchesPrefix(route, pagesBasePath)) {
                if (
                  urlMatchesPrefix(
                    route,
                    trimLeadingSlash(`${pagesBasePath}/__docusaurus`),
                  )
                ) {
                  // Do not index pages generated by the debug plugin
                  return [];
                }
                return {
                  route,
                  url,
                  type: "page" as const,
                };
              }
            }
          }

          return [];
        })
        .map(({ route, url, type }) => {
          const file =
            trailingSlash === false
              ? path.join(outDir, `${route === "" ? "index" : route}.html`)
              : path.join(outDir, route, "index.html");
          return {
            file,
            url,
            type,
          };
        });

      logger.info("Parsing documents");

      // Give every index entry a unique id so that the index does not need to store long URLs.
      let nextDocId = 1;
      const documents = (
        await Promise.all(
          data.map(async ({ file, url, type }) => {
            try {
              logger.debug(`Parsing ${type} file ${file}`, { url });
              const html = await fs.promises.readFile(file, {
                encoding: "utf8",
              });
              const { pageTitle, sections, docSidebarParentCategories } =
                html2text(html, type, url);
              const docusaurusTag = getDocusaurusTag(html);

              return sections.map((section) => ({
                id: nextDocId++,
                pageTitle,
                pageRoute: url,
                sectionRoute: url + section.hash,
                sectionTitle: section.title,
                sectionContent: section.content,
                sectionTags: section.tags,
                docusaurusTag,
                docSidebarParentCategories,
                type,
              }));
            } catch (err) {
              logger.warn(
                `Failed to parse ${type} file ${file}: ${
                  err instanceof Error ? err.message : err
                }`,
                { url },
              );
              return [];
            }
          }),
        )
      ).flat();

      const warnedDocusaurusTags = new Set<string>();
      const documentsByDocusaurusTag = documents.reduce(
        (acc, doc) => {
          const docusaurusTag = sanitizeDocusaurusTag(doc.docusaurusTag);
          if (
            docusaurusTag !== doc.docusaurusTag &&
            !warnedDocusaurusTags.has(doc.docusaurusTag)
          ) {
            warnedDocusaurusTags.add(doc.docusaurusTag);
            logger.warn(
              `Docusaurus tag "${doc.docusaurusTag}" contains characters that are unsafe in a file name and was sanitized to "${docusaurusTag}" for the search index.`,
            );
          }
          acc[docusaurusTag] = acc[docusaurusTag] ?? [];
          acc[docusaurusTag]!.push(doc);
          return acc;
        },
        {} as Record<string, typeof documents>,
      );

      logger.info(
        `${
          Object.keys(documentsByDocusaurusTag).length
        } indexes will be created.`,
      );

      await Promise.all(
        Object.entries(documentsByDocusaurusTag).map(
          async ([docusaurusTag, documents]) => {
            logger.info(
              `Building index ${docusaurusTag} (${documents.length} documents)`,
            );

            const index = lunr(function () {
              if (language !== "en") {
                if (Array.isArray(language)) {
                  this.use(lunr.multiLanguage(...language));
                } else {
                  this.use(
                    (lunr as unknown as Record<string, LunrLanguagePlugin>)[
                      language
                    ],
                  );
                }
              }

              this.k1(k1);
              this.b(b);

              this.ref("id");
              this.field("title");
              this.field("content");
              this.field("tags");

              if (indexDocSidebarParentCategories > 0) {
                this.field("sidebarParentCategories");
              }
              const that = this;
              documents.forEach(
                ({
                  id,
                  sectionTitle,
                  sectionContent,
                  sectionTags,
                  docSidebarParentCategories,
                }) => {
                  let sidebarParentCategories;
                  if (
                    indexDocSidebarParentCategories > 0 &&
                    docSidebarParentCategories
                  ) {
                    sidebarParentCategories = [...docSidebarParentCategories]
                      .reverse()
                      .slice(0, indexDocSidebarParentCategories)
                      .join(" ");
                  }

                  that.add({
                    id: id.toString(), // the ref must be a string
                    title: sectionTitle,
                    content: sectionContent,
                    tags: sectionTags,
                    sidebarParentCategories,
                  });
                },
              );
            });

            await fs.promises.writeFile(
              path.join(outDir, `search-index-${docusaurusTag}.json`),
              JSON.stringify({
                documents: documents.map(
                  ({
                    id,
                    pageTitle,
                    sectionTitle,
                    sectionRoute,
                    type,
                    docSidebarParentCategories,
                  }): MyDocument => {
                    let fullTitle = pageTitle;

                    if (
                      includeParentCategoriesInPageTitle &&
                      docSidebarParentCategories &&
                      docSidebarParentCategories.length > 0
                    ) {
                      fullTitle = [
                        ...docSidebarParentCategories,
                        pageTitle,
                      ].join(" > ");
                    }

                    return {
                      id,
                      pageTitle: fullTitle,
                      sectionTitle,
                      sectionRoute,
                      type,
                    };
                  },
                ),
                index,
              }),
              { encoding: "utf8" },
            );

            logger.info(`Index ${docusaurusTag} written to disk`);
          },
        ),
      );
    },
    configureWebpack: (_config, isServer, utils) => {
      const { getJSLoader } = utils;
      return {
        mergeStrategy: { "module.rules": "prepend" },
        module: {
          rules: [
            {
              test: /client[\\\/]theme[\\\/]SearchBar[\\\/]d-s-l-a-generated\.js$/,
              use: [
                getJSLoader({ isServer }),
                {
                  loader: path.join(__dirname, "lunr-generator.js"),
                  options: { generated },
                },
              ],
            },
          ],
        },
      };
    },
  };
}

export function validateOptions({
  options,
  validate,
}: OptionValidationContext<MyOptions, MyOptions>) {
  return validate(optionsSchema, options);
}
