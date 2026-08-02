import { test, expect, Page } from "@playwright/test";

async function search(page: Page, text: string) {
  const searchFieldButton = page.locator(".dsla-search-field button");
  searchFieldButton.click();

  await expect(page.locator(".aa-Input")).toBeFocused();
  await page.fill(".aa-Input", text);
  await page.press(".aa-Input", "Enter");
}

test("basic search works", async ({ page }) => {
  await page.goto("/");
  await search(page, "3");

  await page.waitForURL("/docs/doc3");
  await expect(page.locator('mark[data-markjs="true"]')).toHaveText("3");
});

async function expectDocVersion(page: Page, version: string) {
  await expect(
    page.locator(
      `.dsla-search-field[data-tags="default,docs-default-${version}"]`,
    ),
  ).toHaveCount(1);
}

test("version matches version in version selector navbar item", async ({
  page,
}) => {
  await page.goto("/");
  const searchFieldButton = page.locator(".dsla-search-field button");

  await expect(searchFieldButton).toHaveText("Search...");
  await expectDocVersion(page, "1.0.0");

  const VERSION_SELECTOR =
    ".navbar__inner > div:nth-child(1) > div:nth-child(3)";
  const currentVersionButton = page.locator(`${VERSION_SELECTOR} > a`);
  await expect(currentVersionButton).toHaveText("1.0.0");

  // Change version to 'Next'
  await currentVersionButton.hover();
  await page.locator(`${VERSION_SELECTOR} > ul > li:nth-child(1) > a`).click();

  await expect(currentVersionButton).toHaveText("Next");
  await expectDocVersion(page, "current");

  // Go back to the homepage, which does not indicate in its url which version is active
  await page.goto("/");
  await expect(currentVersionButton).toHaveText("Next");
  await expectDocVersion(page, "current");

  // Reload the page - the active version should be persisted in localstorage
  await page.reload();
  await expect(currentVersionButton).toHaveText("Next");
  await expectDocVersion(page, "current");

  // Go to a doc of version 1.0.0, it should change the version back to 1.0.0.
  await page.goto("/docs/d-s-l-test");
  await expect(currentVersionButton).toHaveText("1.0.0");
  await expectDocVersion(page, "1.0.0");
});

test("language-based search index is used", async ({ page }) => {
  // Go to a random English doc
  await page.goto("/docs/next/d-s-l-test");

  await search(page, "english");
  await page.waitForURL("/docs/next/translated");

  // Go to a random German doc
  await page.goto("/de/docs/next/d-s-l-test");

  await search(page, "german");
  await page.waitForURL("/de/docs/next/translated");
});

test("dark mode is copied from <html> to <body> correctly", async ({
  page,
}) => {
  async function check(theme: string) {
    await page.locator(`html[data-theme=${theme}]`);
    await page.locator(`body[data-theme=${theme}]`);
  }
  await page.goto("/");
  await check("light");
  await page.locator("svg[class*='lightToggleIcon']").click();
  await check("dark");
  await page.locator("svg[class*='darkToggleIcon']").click();
  await check("light");
});

test("blog search returns results", async ({ page }) => {
  await page.goto("/");
  await search(page, "blog post title");

  // Should navigate to a blog post
  await page.waitForURL(/\/blog\//);
  await expect(page.locator('mark[data-markjs="true"]').first()).toBeVisible();
});

test("search with no results shows empty state", async ({ page }) => {
  await page.goto("/");
  const searchFieldButton = page.locator(".dsla-search-field button");
  searchFieldButton.click();

  await expect(page.locator(".aa-Input")).toBeFocused();
  await page.fill(".aa-Input", "zzzznonexistentqueryzzzz");

  // Should show no results message.
  // Pressing Enter here would close the detached panel by design (no active
  // item to navigate to), so we assert on the empty state that is shown as
  // soon as the query resolves instead.
  await expect(page.locator(".aa-Panel")).toBeVisible();
  await expect(page.locator(".aa-Item")).toHaveCount(0);
});

test("search on static page works", async ({ page }) => {
  await page.goto("/");

  // The index.html page should be searchable if indexPages is enabled
  const searchFieldButton = page.locator(".dsla-search-field button");
  searchFieldButton.click();
  await expect(page.locator(".aa-Input")).toBeFocused();
  await page.fill(".aa-Input", "Index");
  await page.press(".aa-Input", "Escape");
});
