import React, { useRef, useEffect, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { autocomplete, AutocompleteApi } from "@algolia/autocomplete-js";
import type lunr from "lunr";
import { translate } from "@docusaurus/Translate";
import { useHistory } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { mylunr, tokenize } from "./d-s-l-a-generated";
import {
  DSLALocationState,
  HighlightSearchResults,
} from "./HighlightSearchResults";
import { usePluginData } from "@docusaurus/useGlobalData";
import type { DSLAPluginData, MyDocument } from "../../../types";
import { useContextualSearchFilters } from "@docusaurus/theme-common";

const SEARCH_INDEX_AVAILABLE = process.env.NODE_ENV === "production";

type MyItem = {
  document: MyDocument;
  score: number;
  terms: string[];
};

function getItemUrl({ document }: MyItem): string {
  const [path, hash] = document.sectionRoute.split("#");
  let url = path ?? document.sectionRoute;
  if (hash) {
    url += "#" + hash;
  }
  return url;
}

// The mlengse/lunr.js fork refuses to build an index with zero documents
// (upstream lunr allows it), which would throw while this module is loaded
// during SSR. Fall back to a stub index that matches nothing.
export function createEmptyIndex(): lunr.Index {
  try {
    return mylunr(function () {
      this.ref("id");
      this.field("title");
      this.field("content");
    });
  } catch (err) {
    console.warn(
      "[Local Search] Failed to build empty index:",
      err instanceof Error ? err.message : err,
    );
    return {
      query: () => [],
      search: () => [],
    } as unknown as lunr.Index;
  }
}

const EMPTY_INDEX = {
  documents: [],
  index: createEmptyIndex(),
};

export async function fetchIndex(
  baseUrl: string,
  tag: string,
): Promise<IndexWithDocuments> {
  if (SEARCH_INDEX_AVAILABLE) {
    let json;
    try {
      const response = await fetch(`${baseUrl}search-index-${tag}.json`);
      if (!response.ok) return EMPTY_INDEX;
      json = await response.json();
      if (!json || !Array.isArray(json.documents) || !json.index) {
        console.warn("[Local Search] Invalid search index format");
        return EMPTY_INDEX;
      }
    } catch (err) {
      // An index might not actually exist if no pages for it have been indexed.
      // https://github.com/mlengse/docusaurus-search-local/issues/85
      if (
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        console.warn("[Local Search] Failed to fetch index:", err.message);
      }
      return EMPTY_INDEX;
    }

    return {
      documents: json.documents as MyDocument[],
      index: mylunr.Index.load(json.index),
    };
  } else {
    // The index does not exist in development, therefore load a dummy index here.
    return Promise.resolve(EMPTY_INDEX);
  }
}

type IndexWithDocuments = {
  documents: MyDocument[];
  index: lunr.Index;
};

const SearchBar = () => {
  // A bit of a hack that makes sure data-theme is not only set on <html>, but also on <body>.
  // This is needed by the autocomplete for dark mode support
  // https://www.algolia.com/doc/ui-libraries/autocomplete/api-reference/autocomplete-theme-classic/#dark-mode
  useEffect(() => {
    // If we are running SSR, then don't do anything. This deliberately does not use Docusaurus'
    // `useIsBrowser()`, because that returns `false` during hydration, which would lead to flickering.
    // Instead, we directly check for `document` to be defined. This is normally bad practice in Docusaurus,
    // because it might lead to hydration mismatches. However, in this case it is fine, because the effect
    // only sets an attribute on body through JavaScript (not through React!), which does not affect the
    // rendered HTML of this component.
    if (!document) {
      return;
    }

    // Manually sync the attribute.
    // See https://docusaurus.io/docs/api/themes/configuration#use-color-mode for why we do not use `useColorMode()`.
    function syncAttribute() {
      document.body.setAttribute(
        "data-theme",
        document.documentElement.getAttribute("data-theme") ?? "",
      );
    }

    const observer = new MutationObserver(() => {
      syncAttribute();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    syncAttribute();

    return () => observer.disconnect();
  }, []);

  const {
    siteConfig: { baseUrl },
  } = useDocusaurusContext();
  const {
    titleBoost,
    contentBoost,
    tagsBoost,
    parentCategoriesBoost,
    indexDocSidebarParentCategories,
    maxSearchResults,
  } = usePluginData("@cmfcmf/docusaurus-search-local") as DSLAPluginData;

  const history = useHistory<DSLALocationState>();

  const { tags } = useContextualSearchFilters();
  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  const indexes = useRef<
    Record<
      string,
      | {
          state: "loading";
          callbacks: Array<{
            resolve: (index: IndexWithDocuments) => void;
            reject: (error: unknown) => void;
          }>;
        }
      | ({ state: "ready" } & IndexWithDocuments)
    >
  >({});

  const getIndex = async (tag: string): Promise<IndexWithDocuments> => {
    const index = indexes.current[tag];
    switch (index?.state) {
      case "ready":
        return index;
      case undefined: {
        const callbacks: Array<{
          resolve: (index: IndexWithDocuments) => void;
          reject: (error: unknown) => void;
        }> = [];
        indexes.current[tag] = {
          state: "loading",
          callbacks,
        };
        try {
          const fetchedIndex = await fetchIndex(baseUrl, tag);
          callbacks.forEach((cb) => cb.resolve(fetchedIndex));

          indexes.current[tag] = {
            state: "ready",
            ...fetchedIndex,
          };
          return fetchedIndex;
        } catch (err) {
          callbacks.forEach((cb) => cb.reject(err));
          throw err;
        }
      }
      case "loading":
        return new Promise<IndexWithDocuments>((resolve, reject) => {
          index.callbacks.push({ resolve, reject });
        });
    }
  };

  const placeholder = translate({
    message: "cmfcmf/d-s-l.searchBar.placeholder",
    description: "Placeholder shown in the searchbar",
  });

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const autocompleteApi = useRef<AutocompleteApi<MyItem> | null>(null);
  const rootsRef = useRef(
    new Map<HTMLElement, ReturnType<typeof createRoot>>(),
  );

  useEffect(() => {
    if (!autocompleteRef.current) {
      return;
    }

    autocompleteApi.current = autocomplete<MyItem>({
      container: autocompleteRef.current,
      placeholder,
      // Use React instead of Preact
      renderer: {
        createElement,
        Fragment,
        render: (component, container) => {
          const element = container as HTMLElement;
          let root = rootsRef.current.get(element);
          if (!root) {
            root = createRoot(element);
            rootsRef.current.set(element, root);
          }
          root.render(component);
        },
      },
      // Use react-router for navigation
      navigator: {
        navigate({ item, itemUrl }) {
          history.push(itemUrl, {
            cmfcmfhighlight: {
              terms: item.terms,
              isDocsOrBlog:
                item.document.type === "docs" || item.document.type === "blog",
            },
          });
        },
      },
      // always open a modal window
      detachedMediaQuery: "",
      // preselect the first search result
      defaultActiveItemId: 0,

      translations: {
        clearButtonTitle: translate({
          message: "cmfcmf/d-s-l.searchBar.clearButtonTitle",
          description: "Title of the button to clear the current search input",
        }),
        detachedCancelButtonText: translate({
          message: "cmfcmf/d-s-l.searchBar.detachedCancelButtonText",
          description: "Text of the button to close the detached search window",
        }),
        submitButtonTitle: translate({
          message: "cmfcmf/d-s-l.searchBar.submitButtonTitle",
          description: "Title of the button to submit a new search",
        }),
      },

      getSources({ query: input }) {
        return [
          {
            sourceId: "search-results",
            templates: {
              item({ item }) {
                const url = getItemUrl(item);
                return (
                  // We cannot use <Link>, because this stuff is rendered in a completely separate React tree and has no access to the Router and DocusaurusContext.
                  <a
                    href={url}
                    className="aa-ItemLink"
                    onClick={(e) => {
                      e.preventDefault();
                      history.push(url, {
                        cmfcmfhighlight: {
                          terms: item.terms,
                          isDocsOrBlog:
                            item.document.type === "docs" ||
                            item.document.type === "blog",
                        },
                      });
                    }}
                  >
                    <div className="aa-ItemContent">
                      <div className="aa-ItemContentBody">
                        <div className="aa-ItemContentTitle">
                          {item.document.sectionTitle}
                        </div>
                        {item.document.pageTitle !==
                          item.document.sectionTitle && (
                          <div className="aa-ItemContentDescription">
                            {item.document.pageTitle}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="aa-ItemActions">
                      <button
                        className="aa-ItemActionButton aa-DesktopOnly aa-ActiveOnly"
                        type="button"
                        title="Select"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          fill="currentColor"
                        >
                          <path d="M18.984 6.984h2.016v6h-15.188l3.609 3.609-1.406 1.406-6-6 6-6 1.406 1.406-3.609 3.609h13.172v-4.031z" />
                        </svg>
                      </button>
                    </div>
                  </a>
                );
              },
              noResults() {
                return (
                  <div className="aa-ItemContent">
                    <div className="aa-ItemContentBody">
                      {SEARCH_INDEX_AVAILABLE
                        ? translate({
                            message: "cmfcmf/d-s-l.searchBar.noResults",
                            description:
                              "message shown if no results are found",
                          })
                        : // No need to translate this message, since its only shown in development.
                          "The search index is only available when you run docusaurus build!"}
                    </div>
                  </div>
                );
              },
            },
            getItemUrl({ item }) {
              return getItemUrl(item);
            },
            async getItems() {
              const tags = tagsRef.current;
              const indexes = await Promise.all(
                tags.map((tag) => getIndex(tag)),
              );

              const terms = tokenize(input);

              return indexes
                .flatMap(({ index, documents }) =>
                  index
                    .query((query) => {
                      query.term(terms, {
                        fields: ["title"],
                        boost: titleBoost,
                      });
                      query.term(terms, {
                        fields: ["title"],
                        boost: titleBoost,
                        wildcard: mylunr.Query.wildcard.TRAILING,
                      });
                      query.term(terms, {
                        fields: ["content"],
                        boost: contentBoost,
                      });
                      query.term(terms, {
                        fields: ["content"],
                        boost: contentBoost,
                        wildcard: mylunr.Query.wildcard.TRAILING,
                      });
                      query.term(terms, {
                        fields: ["tags"],
                        boost: tagsBoost,
                      });
                      query.term(terms, {
                        fields: ["tags"],
                        boost: tagsBoost,
                        wildcard: mylunr.Query.wildcard.TRAILING,
                      });

                      if (indexDocSidebarParentCategories) {
                        query.term(terms, {
                          fields: ["sidebarParentCategories"],
                          boost: parentCategoriesBoost,
                        });
                        query.term(terms, {
                          fields: ["sidebarParentCategories"],
                          boost: parentCategoriesBoost,
                          wildcard: mylunr.Query.wildcard.TRAILING,
                        });
                      }
                    })
                    .slice(0, maxSearchResults)
                    .map((result) => {
                      const document = documents.find(
                        (d) => d.id.toString() === result.ref,
                      );
                      if (!document) return null;
                      return { document, score: result.score, terms };
                    })
                    .filter((r): r is NonNullable<typeof r> => r !== null),
                )
                .sort((a, b) => b.score - a.score)
                .slice(0, maxSearchResults);
            },
          },
        ];
      },
    });

    return () => {
      autocompleteApi.current?.destroy();
      rootsRef.current.clear();
    };
  }, [maxSearchResults]);

  return (
    <>
      <HighlightSearchResults />
      <div className="dsla-search-wrapper">
        <div
          className="dsla-search-field"
          ref={autocompleteRef}
          data-tags={tags.join(",")}
        />
      </div>
    </>
  );
};

export default SearchBar;
