export interface DocsSectionConfig {
  directory: string;
  title: string;
  order: number;
}

export interface DocsNavbarLinkConfig {
  label: string;
  href: string;
  console?: boolean;
}

export const docsConfig = {
  title: "HelloCoder 文档",
  description: "了解 HelloCoder 使用方式、用户协议与隐私政策。",
  navbar: {
    icon: "/favicon.ico",
    siteName: "HelloCoder",
    sectionName: "文档",
    homeHref: "/docs",
    links: [
      {
        label: "返回首页",
        href: "/",
      },
      {
        label: "控制台",
        href: "/sign-in",
        console: true,
      },
    ] satisfies DocsNavbarLinkConfig[],
  },
  sections: [
    {
      directory: "start",
      title: "快速开始",
      order: 1,
    },
    {
      directory: "legal",
      title: "服务条款",
      order: 2,
    },
  ] satisfies DocsSectionConfig[],
};
