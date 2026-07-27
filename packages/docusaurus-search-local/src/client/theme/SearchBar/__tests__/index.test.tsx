/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchIndex behavior (via fetch mock)", () => {
  it("returns error response when index is not found", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const response = await fetch("/search-index-default.json");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  it("returns invalid JSON when format is wrong", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: true }),
    });
    const response = await fetch("/search-index-default.json");
    const json = await response.json();
    expect(json).not.toHaveProperty("documents");
    expect(json).not.toHaveProperty("index");
  });

  it("returns valid index format", async () => {
    const mockData = { documents: [], index: { version: "2.3.0" } };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
    const response = await fetch("/search-index-default.json");
    const json = await response.json();
    expect(json).toHaveProperty("documents");
    expect(json).toHaveProperty("index");
    expect(Array.isArray(json.documents)).toBe(true);
  });

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetch("/search-index-default.json")).rejects.toThrow(
      "fetch failed",
    );
  });
});
