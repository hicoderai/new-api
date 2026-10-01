import {
  IconBook2,
  IconBooks,
  IconCodeDots,
  IconHeartHandshake,
  IconMicroscope,
  IconPlugConnected,
  IconUsersGroup,
} from "@tabler/icons-react";

import { Hero } from "@/components/hero/hero";
import { Offers } from "@/components/offers/offers";
import { Pricing } from "@/components/pricing/pricing";
import { SmoothScroll } from "@/components/smooth-scroll";

export default function Home() {
  return (
    <SmoothScroll>
      <main id="main-content" className="overflow-x-clip text-neutral-950">
        <Hero
          topCard={{
            href: "/sign-up",
            icon: <IconPlugConnected stroke={1.7} />,
            title: "开始使用",
            description: "注册 HelloCoder 账号",
            backgroundColor: "oklch(54.6% 0.245 262.881)",
            drawerLinks: [
              {
                href: "https://qun.qq.com/universal-share/share?ac=1&authKey=xTo9Lnf0zix1QFzBXcno3My2STosfsePjZExaptyLoNhl3%2BixTeWWVcjoAlv9rH7&busi_data=eyJncm91cENvZGUiOiIxMDk3ODA3MjA0IiwidG9rZW4iOiJhRWg4Y0ZQQ04rOC9YcXBrYU95YzdQZDIrNjhvNVk2MERBMEdhUWpYRHlVOCtaV2NhVXBRcDc5SCtUM1BaUExxIiwidWluIjoiMjU0Nzg2MDkzOSJ9&data=PEiR7FoBIPMogdMUVhNcYQktUd2gq7jpVGM3PbJrHxb9G6yMbVtdAbeRrP19bSmGQtVuip0XMXaICR5g7sogjw&svctype=4&tempid=h5_group_info",
                title: "加入QQ群",
                description: "群号 1097807204 · 接收最新公告",
              },
              {
                href: "/sign-in",
                title: "访问控制台",
                description: "登录 HelloCoder 控制台",
              },
            ],
            drawerQuickLinks: [
              { href: "/pricing", label: "模型列表" },
              { href: "/wallet", label: "账号充值" },
              { href: "/keys", label: "密钥管理" },
            ],
          }}
          bottomCard={{
            href: "/docs",
            icon: <IconBook2 stroke={1.7} />,
            title: "文档",
            description: "已注册 HelloCoder",
            backgroundColor: "oklch(77.7% 0.152 181.912)",
          }}
          topRatio={0.6}
          bottomRatio={0.4}
        />
        <Pricing
          copy={{
            title: "定价清晰，无门槛",
            description:
              "不设置会员制度，不区分用户身份。注册即可使用全部模型，并自由选择不同倍率的分组，按照实际用量计费。",
          }}
          models={[
            {
              name: "ChatGPT",
              logoSrc: "/logo/chatgpt.svg",
              rates: [
                { label: "稳定", multiplier: "0.24x" },
                { label: "默认", multiplier: "0.15x" },
                { label: "福利", multiplier: "0.09x" },
                { label: "超高可用性", multiplier: "0.5x" },
              ],
              availableModels: [
                "GPT 6.1 Sol",
                "GPT 6 Astra",
                "GPT 6 Sol",
                "GPT 6 Luna",
                "GPT 5.6 Sol",
                "GPT 5.6 Terra",
                "GPT 5.6 Luna",
                "GPT 5.5",
                "Image 2.5 Sunburst/Flare",
                "Image 2",
                "Image 1.5",
              ],
            },
            {
              name: "Claude",
              logoSrc: "/logo/claude.svg",
              rates: [
                { label: "默认", multiplier: "0.9x" },
                { label: "福利", multiplier: "0.5x" },
              ],
              availableModels: [
                "Fable 5",
                "Opus 5",
                "Sonnet 5",
                "Opus 4.8",
                "Opus 4.7",
                "Opus 4.6",
                "Sonnet 4.6",
                "Sonnet 4.5",
                "Haiku 4.5",
              ],
            },
            {
              name: "Grok",
              logoSrc: "/logo/grok.svg",
              rates: [{ label: "默认", multiplier: "0.3x" }],
              availableModels: ["Grok 4.6", "Grok 4.5"],
            },
            {
              name: "Gemini",
              logoSrc: "/logo/gemini.svg",
              rates: [{ label: "默认", multiplier: "0.5x" }],
              availableModels: [
                "Gemini 3.8 Flash",
                "Gemini 3.5 Flash Lite",
                "Gemini 3 Flash Preview",
              ],
            },
            {
              name: "DeepSeek",
              logoSrc: "/logo/deepseek.svg",
              rates: [
                { label: "Deepseek", multiplier: "0.6x" },
                { label: "国模", multiplier: "0.55x" },
              ],
              availableModels: [
                "DeepSeek V4.1 Flash",
                "DeepSeek V4 Pro",
                "DeepSeek V4 Flash",
                "DeepSeek V4 Flash 0731",
                "DeepSeek Flash",
              ],
            },
            {
              name: "Doubao Seed",
              logoSrc: "/logo/doubao.svg",
              rates: [{ label: "国模", multiplier: "0.55x" }],
              availableModels: [
                "Doubao Seed 2.1 Pro",
                "Doubao Seed 2.1 Turbo",
                "Doubao Seed 2.1 Lite",
                "Doubao Seed 2.0 Pro",
                "Doubao Seed 2.0 Lite",
                "Doubao Seed 2.0 Mini",
                "Doubao Seed Evolving",
                "Doubao Seed Character",
                "Doubao Seed Translation",
              ],
            },
            {
              name: "GLM",
              logoSrc: "/logo/glm.svg",
              rates: [
                { label: "智谱", multiplier: "0.6x" },
                { label: "国模", multiplier: "0.55x" },
              ],
              availableModels: ["GLM 5.3", "GLM 5.3 Flash", "GLM 5.2"],
            },
            {
              name: "Kimi",
              logoSrc: "/logo/kimi.svg",
              rates: [{ label: "国模", multiplier: "0.55x" }],
              availableModels: ["Kimi K3", "Kimi K2.7 Code"],
            },
            {
              name: "MiniMax",
              logoSrc: "/logo/minimax.svg",
              rates: [{ label: "国模", multiplier: "0.55x" }],
              availableModels: ["MiniMax M3"],
            },
            {
              name: "Qwen",
              logoSrc: "/logo/qwen.svg",
              rates: [{ label: "国模", multiplier: "0.55x" }],
              availableModels: ["Qwen 3.8 Max", "Qwen 3.8 Flash", "Qwen 3.7 Max", "Qwen 3.7 Plus"],
            },
          ]}
        />
        <Offers
          ariaLabel="适用场景与代金券方案"
          useCases={{
            copy: {
              title: "With AI",
              description: "从学术研究、知识积累到人机恋，根据使用场景选择合适的模型。",
            },
            recommendationLabel: "推荐模型",
            items: [
              {
                label: "学术研究",
                icon: <IconMicroscope stroke={1.7} />,
                color: "#2563eb",
                recommendedModels: ["Claude Fable 5", "GPT 6.1 Sol", "Gemini 3.8 Flash"],
              },
              {
                label: "VibeCoding",
                icon: <IconCodeDots stroke={1.7} />,
                color: "#4f46e5",
                recommendedModels: ["Claude Fable 5", "GPT 6.1 Sol", "Grok 4.6"],
              },
              {
                label: "心理陪伴",
                icon: <IconHeartHandshake stroke={1.7} />,
                color: "#f43f5e",
                recommendedModels: [
                  "情感 Claude Opus 4.6",
                  "情感 D老师 v4flash",
                  "Grok 4.5",
                  "GPT 5.5",
                ],
              },
              {
                label: "办公协作",
                icon: <IconUsersGroup stroke={1.7} />,
                color: "#0d9488",
                recommendedModels: ["GPT 5.6 Terra", "GPT 5.5", "Claude Opus 4.8"],
              },
              {
                label: "个人知识库",
                icon: <IconBooks stroke={1.7} />,
                color: "#d97706",
                recommendedModels: [
                  "Gemini 3.5 Flash Lite",
                  "Gemini 3.8 Flash",
                  "GPT 6 Luna",
                  "GPT 5.5",
                ],
              },
            ],
          }}
          vouchers={{
            copy: {
              title: "代金券",
              description: "充值赠送额外额度，优惠力度十足。",
            },
            plans: [
              {
                href: "/wallet",
                paymentLabel: "充值",
                payment: "¥35",
                bonusLabel: "赠送",
                bonus: "$5",
                totalLabel: "到账",
                total: "$40",
                color: "oklch(57.7% 0.245 27.325)",
              },
              {
                href: "/wallet",
                paymentLabel: "充值",
                payment: "¥60",
                bonusLabel: "赠送",
                bonus: "$10",
                totalLabel: "到账",
                total: "$70",
                color: "oklch(62.7% 0.194 149.214)",
              },
            ],
            images: [
              {
                src: "/images/voucher40.png",
                alt: "充值 35 元、到账 40 元的代金券",
                width: 1299,
                height: 476,
              },
              {
                src: "/images/voucher70.png",
                alt: "充值 60 元、到账 70 元的代金券",
                width: 1228,
                height: 503,
              },
            ],
          }}
        />
      </main>
    </SmoothScroll>
  );
}
