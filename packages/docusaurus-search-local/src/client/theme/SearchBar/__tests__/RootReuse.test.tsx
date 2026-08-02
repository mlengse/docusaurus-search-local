/**
 * @jest-environment jsdom
 */
import React from "react";
import "@testing-library/jest-dom";
import { render, act } from "@testing-library/react";
import { autocomplete } from "@algolia/autocomplete-js";
import { createRoot } from "react-dom/client";
import SearchBar from "../index";

jest.mock("react-dom/client", () => {
  const actual = jest.requireActual("react-dom/client");
  return {
    ...actual,
    createRoot: jest.fn((...args) => actual.createRoot(...args)),
  };
});

function getRenderer() {
  const options = (autocomplete as jest.Mock).mock.calls[0][0];
  return options.renderer;
}

function createRootCallsFor(element: HTMLElement) {
  return (createRoot as jest.Mock).mock.calls.filter(
    ([container]) => container === element,
  );
}

describe("SearchBar renderer root reuse", () => {
  it("reuses the same React root when rendering into the same container", async () => {
    render(React.createElement(SearchBar));
    const renderer = getRenderer();

    const container = document.createElement("div");
    await act(async () => {
      renderer.render(React.createElement("span", null, "first"), container);
    });
    await act(async () => {
      renderer.render(React.createElement("span", null, "second"), container);
    });

    expect(createRootCallsFor(container)).toHaveLength(1);
    expect(container).toHaveTextContent("second");
  });

  it("creates a new root when rendering into a different container", async () => {
    render(React.createElement(SearchBar));
    const renderer = getRenderer();

    const containerA = document.createElement("div");
    const containerB = document.createElement("div");
    await act(async () => {
      renderer.render(React.createElement("span", null, "a"), containerA);
      renderer.render(React.createElement("span", null, "b"), containerB);
    });

    expect(createRootCallsFor(containerA)).toHaveLength(1);
    expect(createRootCallsFor(containerB)).toHaveLength(1);
  });

  it("destroys the autocomplete instance when the search bar unmounts", async () => {
    const { unmount } = render(React.createElement(SearchBar));
    const destroy = (autocomplete as jest.Mock).mock.results[0].value.destroy;

    await act(async () => {
      unmount();
    });

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
