import type { Metadata } from "next";

export const siteUrl = "https://hicoder.de";
export const siteName = "HelloCoder-API";
export const siteDescription =
  "HelloCoder-API 为开发者提供统一的 AI 模型 API 接口，支持文本、代码与图像生成，提供模型选择、密钥管理、用量统计及按量计费。查看模型价格、接入文档与服务条款。";

export function pageMetadata(title: string, description: string, pathname: string): Metadata {
  const url = new URL(pathname, siteUrl).href;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName,
      title,
      description,
      url,
      images: [{ url: `${siteUrl}/images/logo.webp`, alt: siteName }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [`${siteUrl}/images/logo.webp`],
    },
  };
}
