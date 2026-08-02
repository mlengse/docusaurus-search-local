/**
 * @jest-environment jsdom
 */
import React from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import Mark from "mark.js";
import { useLocation, useHistory } from "@docusaurus/router";
import { HighlightSearchResults } from "../HighlightSearchResults";

const mockPush = jest.fn();
const mockReplace = jest.fn();

const mockInstances = () => (Mark as any).instances as any[];

beforeEach(() => {
  (Mark as any).instances = [];
  mockPush.mockClear();
  mockReplace.mockClear();
  (useLocation as jest.Mock).mockReturnValue({ state: null, pathname: "/" });
  (useHistory as jest.Mock).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
  });
  document.body.innerHTML = "";
});

describe("HighlightSearchResults", () => {
  it("does nothing when there is no highlight state", () => {
    render(React.createElement(HighlightSearchResults));

    expect(mockInstances()).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does nothing when the highlight state has no terms", () => {
    (useLocation as jest.Mock).mockReturnValue({
      state: { cmfcmfhighlight: { terms: [], isDocsOrBlog: true } },
      pathname: "/docs/foo",
    });

    render(React.createElement(HighlightSearchResults));

    expect(mockInstances()).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("marks terms in <article> for docs and blog pages", () => {
    document.body.innerHTML = "<article><p>content</p></article>";
    (useLocation as jest.Mock).mockReturnValue({
      state: {
        cmfcmfhighlight: { terms: ["foo"], isDocsOrBlog: true },
      },
      pathname: "/docs/foo",
    });

    render(React.createElement(HighlightSearchResults));

    expect(mockInstances()).toHaveLength(1);
    const mark = mockInstances()[0];
    expect(mark.root).toBe(document.getElementsByTagName("article")[0]);
    expect(mark.markedTerms).toEqual(["foo"]);
    expect(mark.markedOptions).toEqual({ ignoreJoiners: true });
  });

  it("marks terms in <main> for non-docs and non-blog pages", () => {
    document.body.innerHTML = "<main><p>content</p></main>";
    (useLocation as jest.Mock).mockReturnValue({
      state: {
        cmfcmfhighlight: { terms: ["bar"], isDocsOrBlog: false },
      },
      pathname: "/",
    });

    render(React.createElement(HighlightSearchResults));

    expect(mockInstances()).toHaveLength(1);
    expect(mockInstances()[0].root).toBe(
      document.getElementsByTagName("main")[0],
    );
  });

  it("clears the highlight data from location state after applying it", () => {
    (useLocation as jest.Mock).mockReturnValue({
      state: {
        cmfcmfhighlight: { terms: ["foo"], isDocsOrBlog: false },
        other: 1,
      },
      pathname: "/docs/foo",
    });

    render(React.createElement(HighlightSearchResults));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const replaceArg = mockReplace.mock.calls[0][0];
    expect(replaceArg.pathname).toBe("/docs/foo");
    expect(replaceArg.state).not.toHaveProperty("cmfcmfhighlight");
    expect(replaceArg.state).toEqual({ other: 1 });
  });

  it("does not create a Mark instance when no article/main root exists", () => {
    (useLocation as jest.Mock).mockReturnValue({
      state: {
        cmfcmfhighlight: { terms: ["foo"], isDocsOrBlog: true },
      },
      pathname: "/docs/foo",
    });

    render(React.createElement(HighlightSearchResults));

    expect(mockInstances()).toHaveLength(0);
  });

  it("unmarks when the component unmounts", () => {
    document.body.innerHTML = "<main><p>content</p></main>";
    (useLocation as jest.Mock).mockReturnValue({
      state: {
        cmfcmfhighlight: { terms: ["foo"], isDocsOrBlog: false },
      },
      pathname: "/",
    });

    const { unmount } = render(React.createElement(HighlightSearchResults));

    expect(mockInstances()).toHaveLength(1);
    expect(mockInstances()[0].unmarked).toBe(false);

    unmount();

    expect(mockInstances()[0].unmarked).toBe(true);
    expect(mockInstances()[0].unmarkOptions).toEqual({ ignoreJoiners: true });
  });
});
