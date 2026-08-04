/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

let fetchIndex: typeof import("../index").fetchIndex;
let mylunr: any;

const mockFetch = jest.fn();
let warnSpy: jest.SpyInstance;

beforeAll(async () => {
  jest.resetModules();
  process.env.NODE_ENV = "production";
  global.fetch = mockFetch;
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  ({ fetchIndex } = await import("../index"));
  mylunr = require("../../../../__mocks__/d-s-l-a-generated").mylunr;
});

afterAll(() => {
  process.env.NODE_ENV = "test";
  warnSpy.mockRestore();
});

describe("fetchIndex (production)", () => {
  it("returns the empty index when the response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchIndex("/", "default");

    expect(result.documents).toEqual([]);
    expect(mylunr.Index.load).not.toHaveBeenCalled();
  });

  it("returns the empty index when the payload has an invalid format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invalid: true }),
    });

    const result = await fetchIndex("/", "default");

    expect(result.documents).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Local Search] Invalid search index format"),
    );
    expect(mylunr.Index.load).not.toHaveBeenCalled();
  });

  it("returns documents and a loaded index for a valid payload", async () => {
    const documents = [{ id: "1", title: "Hello" }];
    const serializedIndex = { version: "2.3.0" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ documents, index: serializedIndex }),
    });

    const result = await fetchIndex("/", "default");

    expect(result.documents).toEqual(documents);
    expect(mylunr.Index.load).toHaveBeenCalledWith(serializedIndex);
  });

  it("returns the empty index and warns on a network TypeError", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await fetchIndex("/", "default");

    expect(result.documents).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Local Search] Failed to fetch index"),
      expect.stringContaining("fetch failed"),
    );
  });

  it("returns the empty index and warns when the error message mentions fetch", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await fetchIndex("/", "default");

    expect(result.documents).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Local Search] Failed to fetch index"),
      expect.stringContaining("Failed to fetch"),
    );
  });

  it("swallows unrelated errors without warning", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Something else went wrong"));

    const result = await fetchIndex("/", "default");

    expect(result.documents).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[Local Search] Failed to fetch index"),
    );
  });
});
