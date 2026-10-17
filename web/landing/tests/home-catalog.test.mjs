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
    "DeepSeek V4 Flash",
    "DeepSeek Flash",
    "Doubao Seed 2.1 Pro",
    "Doubao Seed 2.1 Turbo",
    "Doubao Seed 2.1 Lite",
    "Doubao Seed 2.0 Pro",
    "Doubao Seed 2.0 Lite",
    "Doubao Seed 2.0 Mini",
    "Doubao Seed Evolving",
    "Doubao Seed Translation",
    "GLM 5.3 Flash",
    "GLM 5.2",
    "Kimi K3",
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
    "DeepSeek V4 Pro",
    "DeepSeek V4 Flash 0731",
    "Doubao Seed Character",
    'GLM 5.3"',
    "Kimi K2.7 Code",
    "MiniMax M3",
    "Qwen 3.8 Max",
    "Qwen 3.8 Flash",
    "Qwen 3.7 Max",
    "Qwen 3.7 Plus",
    "情感 Claude Opus 4.6",
    "情感 D老师 v4flash",
  ]) {
    assert.ok(!html.includes(model), `Retired model remains: ${model}`);
  }
});

test("Doubao homepage category uses the Doubao Seed brand name", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(String.raw`\"name\":\"Doubao Seed\"`));
  assert.ok(!html.includes(String.raw`\"name\":\"豆包\"`));
});

test("homepage rates omit unavailable groups and retain GLM domestic access", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  const entries = html
    .replaceAll(String.raw`\"`, '"')
    .match(/\{"name":"(?:ChatGPT|Claude|GLM)".*?"availableModels":\[[^\]]*\]\}/g);
  assert.ok(entries, "Missing homepage pricing entries");
  const ratesByModel = Object.fromEntries(
    entries.map((entry) => {
      const model = JSON.parse(entry);
      return [model.name, model.rates];
    }),
  );
  assert.deepEqual(ratesByModel, {
    ChatGPT: [
      { label: "超高可用性", multiplier: "0.5x" },
      { label: "稳定", multiplier: "0.24x" },
      { label: "福利", multiplier: "0.09x" },
    ],
    Claude: [{ label: "默认", multiplier: "0.9x" }],
    GLM: [
      { label: "智谱", multiplier: "0.6x" },
      { label: "国模", multiplier: "0.55x" },
    ],
  });
});
