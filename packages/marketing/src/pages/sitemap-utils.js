const SITE_URL = "https://lydie.co";

export function generateUrlEntry({ path, priority, changefreq, lastmod }) {
  const loc = `${SITE_URL}${path}`;
  const lastmodAttr = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `  <url>
    <loc>${loc}</loc>${lastmodAttr}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export function generateSitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

export function generateSitemapIndex(sitemaps) {
  const entries = sitemaps.map((sitemap) => {
    const lastmodAttr = sitemap.lastmod ? `\n    <lastmod>${sitemap.lastmod}</lastmod>` : "";
    return `  <sitemap>
    <loc>${SITE_URL}/${sitemap.path}</loc>${lastmodAttr}
  </sitemap>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>`;
}

export const sitemapHeaders = {
  "Content-Type": "application/xml",
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};
