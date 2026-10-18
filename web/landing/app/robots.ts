import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/v1/",
        "/v1beta/",
        "/dashboard",
        "/console",
        "/channels",
        "/keys",
        "/profile",
        "/security",
        "/wallet",
        "/usage-logs",
        "/users",
        "/system-settings",
        "/oauth",
        "/sign-in",
        "/sign-up",
        "/forgot-password",
        "/reset",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
