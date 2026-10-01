import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exported homepage includes newly available models and omits retired models", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  const activeModels = [
    "GPT 6.1 Sol",
    "GPT 6 Astra",
    "GPT 6 Sol",
    "GPT 6 Luna",
    "Image 1.5",
    "Image 2",
    "Image 2.5 Sunburst/Flare",
    "Gemini 3.8 Flash",
    "Gemini 3.5 Flash Lite",
    "Gemini 3 Flash Preview",
    "Grok 4.6",
    "DeepSeek V4.1 Flash",
    "DeepSeek V4 Pro",
    "Doubao Seed 2.1 Pro",
    "Doubao Seed 2.1 Turbo",
    "Doubao Seed 2.1 Lite",
    "Doubao Seed 2.0 Pro",
    "Doubao Seed 2.0 Lite",
    "Doubao Seed 2.0 Mini",
    "Doubao Seed Evolving",
    "Doubao Seed Character",
    "Doubao Seed Translation",
    "GLM 5.3",
    "GLM 5.3 Flash",
    "GLM 5.2",
    "Kimi K3",
    "Kimi K2.7 Code",
    "MiniMax M3",
    "Qwen 3.8 Max",
    "Qwen 3.8 Flash",
    "Qwen 3.7 Max",
    "Qwen 3.7 Plus",
  ];
  for (const model of activeModels) {
    assert.ok(html.includes(model), `Missing available model: ${model}`);
  }
  for (const model of [
    "GPT 5.4 Mini",
    "GPT Image",
    "Image 2.5 Flare",
    'Image 2.5 Sunburst"',
    'Image 2.5"',
    "Gemini 3.1 Pro",
    'Gemini 3.5 Flash"',
    "Gemini 3.6 Flash",
    "gemini-3.6-flash",
    'GPT 5.4"',
    "codex-auto-review",
    "deepseek-v4-1-flash-260910",
    "glm-5-2-260617",
    "glm-5-3-flash-260828",
  ]) {
    assert.ok(!html.includes(model), `Retired model remains: ${model}`);
  }
});

test("Doubao homepage category uses the Doubao Seed brand name", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(String.raw`\"name\":\"Doubao Seed\"`));
  assert.ok(!html.includes(String.raw`\"name\":\"豆包\"`));
});

test("GLM homepage entry lists both Zhipu and domestic group rates", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  const entry = html
    .replaceAll(String.raw`\"`, '"')
    .match(/\{"name":"GLM".*?"availableModels":\[[^\]]*\]\}/);
  assert.ok(entry, "Missing GLM homepage entry");
  const model = JSON.parse(entry[0]);
  assert.deepEqual(model.rates, [
    { label: "智谱", multiplier: "0.6x" },
    { label: "国模", multiplier: "0.55x" },
  ]);
});
