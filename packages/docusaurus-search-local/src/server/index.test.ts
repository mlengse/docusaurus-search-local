import {
  validateOptions,
  trimLeadingSlash,
  trimTrailingSlash,
  urlMatchesPrefix,
  codeTranslationLocalesToTry,
  sanitizeDocusaurusTag,
} from "./index";

const validate = <TInput, TOutput>(
  schema: { validate: (options: TInput) => { error?: Error; value: TOutput } },
  options: TInput,
): TOutput => {
  const result = schema.validate(options);
  if (result.error) {
    throw result.error;
  }
  return result.value;
};

const DEFAULT_OPTIONS = {
  indexDocs: true,
  indexDocSidebarParentCategories: 0,
  includeParentCategoriesInPageTitle: false,
  indexBlog: true,
  indexPages: false,
  language: "en",
  style: undefined,
  maxSearchResults: 8,
  lunr: {
    tokenizerSeparator: undefined,
    b: 0.75,
    k1: 1.2,
    titleBoost: 5,
    contentBoost: 1,
    tagsBoost: 3,
    parentCategoriesBoost: 2,
  },
};

it("validates options correctly", () => {
  expect(() =>
    validateOptions({ options: { foo: 123 }, validate } as any),
  ).toThrowErrorMatchingInlineSnapshot(`""foo" is not allowed"`);

  expect(() =>
    validateOptions({ options: { style: "modern" }, validate } as any),
  ).toThrowErrorMatchingInlineSnapshot(`""style" must be [none]"`);

  expect(validateOptions({ options: {}, validate })).toEqual(DEFAULT_OPTIONS);

  expect(
    validateOptions({ options: { language: ["en", "de"] }, validate }),
  ).toEqual({
    ...DEFAULT_OPTIONS,
    language: ["en", "de"],
  });

  [-1, 1.4, Infinity].forEach((value) =>
    expect(() =>
      validateOptions({
        options: { indexDocSidebarParentCategories: value },
        validate,
      }),
    ).toThrowError(),
  );

  const options = {
    indexDocs: false,
    indexDocSidebarParentCategories: 3,
    includeParentCategoriesInPageTitle: false,
    indexBlog: false,
    indexPages: true,
    language: "hi",
    style: "none",
    maxSearchResults: 123,
    lunr: {
      tokenizerSeparator: /-+/,
      b: 0.6,
      k1: 0.2,
      titleBoost: 10,
      contentBoost: 1,
      tagsBoost: 3,
      parentCategoriesBoost: 4,
    },
  };

  expect(validateOptions({ options, validate })).toEqual(options);
});

describe("trimLeadingSlash", () => {
  it("strips a single leading slash", () => {
    expect(trimLeadingSlash("/foo")).toBe("foo");
  });

  it("returns empty string for slash-only input", () => {
    expect(trimLeadingSlash("/")).toBe("");
  });

  it("returns path unchanged if no leading slash", () => {
    expect(trimLeadingSlash("foo")).toBe("foo");
  });

  it("returns empty string for empty input", () => {
    expect(trimLeadingSlash("")).toBe("");
  });

  it("only strips the first slash", () => {
    expect(trimLeadingSlash("//foo")).toBe("/foo");
  });
});

describe("trimTrailingSlash", () => {
  it("strips a single trailing slash", () => {
    expect(trimTrailingSlash("foo/")).toBe("foo");
  });

  it("returns empty string for slash-only input", () => {
    expect(trimTrailingSlash("/")).toBe("");
  });

  it("returns path unchanged if no trailing slash", () => {
    expect(trimTrailingSlash("foo")).toBe("foo");
  });

  it("returns empty string for empty input", () => {
    expect(trimTrailingSlash("")).toBe("");
  });

  it("only strips the last slash", () => {
    expect(trimTrailingSlash("foo//")).toBe("foo/");
  });
});

describe("urlMatchesPrefix", () => {
  it("returns true for empty prefix (matches everything)", () => {
    expect(urlMatchesPrefix("docs/getting-started", "")).toBe(true);
  });

  it("returns true for exact match", () => {
    expect(urlMatchesPrefix("docs", "docs")).toBe(true);
  });

  it("returns true for subpath match", () => {
    expect(urlMatchesPrefix("docs/getting-started", "docs")).toBe(true);
  });

  it("returns false for no match", () => {
    expect(urlMatchesPrefix("blog/my-post", "docs")).toBe(false);
  });

  it("throws if prefix starts with /", () => {
    expect(() => urlMatchesPrefix("docs", "/docs")).toThrow(
      "prefix must not start with a /",
    );
  });

  it("throws if prefix ends with /", () => {
    expect(() => urlMatchesPrefix("docs", "docs/")).toThrow(
      "prefix must not end with a /",
    );
  });
});

describe("codeTranslationLocalesToTry", () => {
  it("returns just the locale for simple language codes", () => {
    const result = codeTranslationLocalesToTry("en");
    expect(result[0]).toBe("en");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns locale with region fallback for region-specific locales", () => {
    const result = codeTranslationLocalesToTry("pt-BR");
    expect(result).toContain("pt-BR");
    expect(result).toContain("pt");
  });

  it("returns just the locale for 'de'", () => {
    const result = codeTranslationLocalesToTry("de");
    expect(result[0]).toBe("de");
  });
});

describe("sanitizeDocusaurusTag", () => {
  it("passes through valid tags unchanged", () => {
    expect(sanitizeDocusaurusTag("default")).toBe("default");
    expect(sanitizeDocusaurusTag("docs-default-1.0.0")).toBe(
      "docs-default-1.0.0",
    );
    expect(sanitizeDocusaurusTag("blog")).toBe("blog");
  });

  it("strips characters that are unsafe in a file name", () => {
    expect(sanitizeDocusaurusTag("../../evil")).toBe("evil");
    expect(sanitizeDocusaurusTag("foo bar/baz")).toBe("foobarbaz");
    expect(sanitizeDocusaurusTag("a<b&c>\"'")).toBe("abc");
  });

  it("strips leading and trailing dots and dashes", () => {
    expect(sanitizeDocusaurusTag("..hidden")).toBe("hidden");
    expect(sanitizeDocusaurusTag("-leading")).toBe("leading");
    expect(sanitizeDocusaurusTag("trailing.")).toBe("trailing");
    expect(sanitizeDocusaurusTag("trailing-")).toBe("trailing");
  });

  it("falls back to 'default' when nothing remains", () => {
    expect(sanitizeDocusaurusTag("///")).toBe("default");
    expect(sanitizeDocusaurusTag("..")).toBe("default");
  });
});
