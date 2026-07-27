module.exports = {
  clearMocks: true,
  coverageDirectory: "coverage",
  projects: [
    {
      displayName: "server",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/server/**/*.test.{ts,tsx}"],
      coverageThreshold: {
        global: {
          lines: 40,
          branches: 30,
        },
      },
    },
    {
      displayName: "client",
      testEnvironment: "jest-environment-jsdom",
      testMatch: ["<rootDir>/src/client/**/*.test.{ts,tsx}"],
      moduleNameMapper: {
        "\\.css$": "<rootDir>/src/__mocks__/styleMock.js",
        "d-s-l-a-generated": "<rootDir>/src/__mocks__/d-s-l-a-generated.js",
        "^@docusaurus/router$":
          "<rootDir>/src/__mocks__/docusaurus_router.js",
        "^@docusaurus/useDocusaurusContext$":
          "<rootDir>/src/__mocks__/docusaurus_useDocusaurusContext.js",
        "^@docusaurus/useGlobalData$":
          "<rootDir>/src/__mocks__/docusaurus_useGlobalData.js",
        "^@docusaurus/theme-common$":
          "<rootDir>/src/__mocks__/docusaurus_theme-common.js",
        "^@docusaurus/Translate$":
          "<rootDir>/src/__mocks__/docusaurus_Translate.js",
        "^@algolia/autocomplete-js$":
          "<rootDir>/src/__mocks__/algolia_autocomplete-js.js",
        "^react-dom/client$":
          "<rootDir>/src/__mocks__/react-dom_client.js",
        "^mark\\.js$": "<rootDir>/src/__mocks__/mark.js.js",
      },
    },
  ],
};
