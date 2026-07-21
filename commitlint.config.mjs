export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [2, "always", "sentence-case"],
  },
  ignores: [(commit) => commit.includes("Signed-off-by: dependabot[bot]")],
  helpUrl:
    "https://github.com/mlengse/docusaurus-search-local/blob/main/CONTRIBUTING.md#commit-message-guidelines",
};
