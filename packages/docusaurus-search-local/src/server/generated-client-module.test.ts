import { execFileSync } from "child_process";
import path from "path";
import { generateClientModule } from "./index";

const packageRoot = path.join(__dirname, "..", "..");

function runGeneratedModule(
  language: string | string[],
  tokenizerSeparator: RegExp | undefined,
  inputs: string[],
): { outputs: string[][]; meta: { zhTokenizerType: string } } {
  const generated = generateClientModule({
    style: "none",
    language,
    lunr: { tokenizerSeparator },
  });
  const source =
    generated.replace(/^export const /gm, "const ") +
    "\nconst __run = (inputs) => inputs.map((input) => tokenize(input));\n" +
    "const __meta = { zhTokenizerType: typeof (mylunr && mylunr.zh && mylunr.zh.tokenizer) };\n" +
    "module.exports = { __run, __meta };\n" +
    "process.stdout.write(JSON.stringify({ outputs: __run(JSON.parse(process.argv[1])), meta: __meta }));\n";

  const stdout = execFileSync(
    process.execPath,
    ["-e", source, JSON.stringify(inputs)],
    { cwd: packageRoot, encoding: "utf8" },
  );
  return JSON.parse(stdout);
}

describe("generateClientModule", () => {
  it("tokenizes CJK text into multiple segments for ['zh', 'en']", () => {
    const { outputs } = runGeneratedModule(["zh", "en"], undefined, [
      "中文搜索引擎",
    ]);
    const tokens = outputs[0];
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens).toContain("中文");
    expect(tokens).toContain("搜索引擎");
    expect(tokens.every((t) => typeof t === "string")).toBe(true);
  });

  it("keeps Latin tokens intact alongside CJK tokens for ['zh', 'en']", () => {
    const { outputs } = runGeneratedModule(["zh", "en"], undefined, [
      "foo 中文",
    ]);
    const tokens = outputs[0];
    expect(tokens).toContain("foo");
    expect(tokens).toContain("中文");
  });

  it("does not segment CJK text for ['de', 'en']", () => {
    const { outputs } = runGeneratedModule(["de", "en"], undefined, [
      "foo bar baz",
      "中文",
    ]);
    expect(outputs[0]).toEqual(["foo", "bar", "baz"]);
    expect(outputs[1]).toEqual(["中文"]);
  });

  it("applies tokenizerSeparator for array languages", () => {
    const { outputs } = runGeneratedModule(["de", "en"], /[_ ]+/, [
      "foo_bar baz",
    ]);
    expect(outputs[0]).toEqual(["foo", "bar", "baz"]);
  });

  it("still tokenizes CJK text for scalar 'zh' (regression)", () => {
    const { outputs } = runGeneratedModule("zh", undefined, ["中文搜索引擎"]);
    expect(outputs[0]).toEqual(["中文", "搜索引擎"]);
  });

  it("exports mylunr with the language plugins registered", () => {
    const { meta } = runGeneratedModule(["zh", "en"], undefined, []);
    expect(meta.zhTokenizerType).toBe("function");
  });
});
