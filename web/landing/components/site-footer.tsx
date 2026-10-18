import Link from "next/link";

const footerLinks = [
  { href: "/docs/legal/user-agreement/", label: "用户协议" },
  { href: "/docs/legal/privacy-policy/", label: "隐私政策" },
  { href: "/docs/legal/user-agreement/#违规内容举报", label: "内容标准与举报" },
  { href: "/pricing", label: "模型与定价" },
  { href: "/docs/", label: "使用文档" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-black/[0.06] bg-white px-6 py-10 text-neutral-950 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col justify-between gap-6 sm:flex-row">
          <div className="max-w-xl">
            <Link href="/" className="font-semibold focus-visible:outline-offset-4">
              HelloCoder-API
            </Link>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              面向开发者的 AI 模型 API 服务，按实际调用用量计费。模型输出为 AI
              生成内容，使用前请核验。
            </p>
          </div>
          <div className="text-sm leading-relaxed">
            <p className="font-medium">客户支持、内容举报与隐私咨询</p>
            <a
              href="mailto:report@hicoder.de"
              className="mt-2 inline-block break-all text-neutral-600 underline underline-offset-4 hover:text-neutral-950 focus-visible:outline-offset-4"
            >
              report@hicoder.de
            </a>
          </div>
        </div>
        <nav aria-label="服务与法律信息" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-neutral-600 underline underline-offset-4 hover:text-neutral-950 focus-visible:outline-offset-4"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <p className="text-xs leading-relaxed text-neutral-500">
          除适用法律强制要求外，不支持退款。充值、计费及违规处置规则详见用户协议。
        </p>
      </div>
    </footer>
  );
}
