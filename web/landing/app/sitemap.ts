import type { MetadataRoute } from "next";

import { getAllDocuments } from "@/lib/docs/content";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/docs/", ...getAllDocuments().map((document) => `${document.href}/`)].map(
    (pathname) => ({ url: new URL(pathname, siteUrl).href }),
  );
}
