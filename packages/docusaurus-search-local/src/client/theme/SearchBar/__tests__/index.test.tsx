/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { createEmptyIndex, fetchIndex } from "../index";

const { mylunr } = require("../../../../__mocks__/d-s-l-a-generated") as {
  mylunr: jest.Mock;
};

const mockFetch = jest.fn();

beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
});

describe("createEmptyIndex", () => {
  it("builds an index when mylunr succeeds", () => {
    const index = createEmptyIndex();

    expect(mylunr).toHaveBeenCalledWith(expect.any(Function));
    expect(index).toBeDefined();
  });

  it("falls back to a stub index when mylunr throws", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mylunr.mockImplementationOnce(() => {
      throw new Error("Cannot build an empty index");
    });

    const index = createEmptyIndex();

    const stubIndex = index as unknown as {
      query: () => unknown[];
      search: () => unknown[];
    };
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Local Search] Failed to build empty index"),
      expect.stringContaining("Cannot build an empty index"),
    );
    expect(stubIndex.query()).toEqual([]);
    expect(stubIndex.search()).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe("fetchIndex (development)", () => {
  it("returns the empty index without fetching when the search index is unavailable", async () => {
    const result = await fetchIndex("/", "default");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.documents).toEqual([]);
    expect(result.index).toBeDefined();
  });
});
