import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../");
const BASE_URL = "http://localhost:3000";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    testsFailed++;
  }
}

async function run() {
  console.log("=======================================================");
  console.log("🔍 TESTING TECHNICAL SEO IMPLEMENTATION & PROTECTION");
  console.log("=======================================================\n");

  // Ensure server is up
  let srvInstance = null;
  const initialCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!initialCheck || !initialCheck.ok) {
    const srvMod = await import("../server.js");
    srvInstance = srvMod.server;
  }

  // 1. Static Metadata Verification (index.html)
  console.log("▶ TEST SUITE 1: Public Homepage SEO Metadata");
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");

  assert(
    indexHtml.includes("<title>Student Admission Portal | Online College Admission Management</title>"),
    "Homepage has descriptive, professional title"
  );
  assert(
    /<meta\s+name=["']description["']\s+content=["']Apply for admission online,/i.test(indexHtml),
    "Homepage has accurate meta description"
  );
  assert(
    indexHtml.includes('<link rel="canonical" href="https://college-project-frontend-9hme.onrender.com/">'),
    "Homepage specifies canonical public frontend URL"
  );
  assert(
    indexHtml.includes('<meta name="robots" content="index, follow'),
    "Homepage explicitly allows indexing and following"
  );
  assert(
    indexHtml.includes('<meta property="og:title"') &&
    indexHtml.includes('<meta property="og:description"') &&
    indexHtml.includes('<meta property="og:image"') &&
    indexHtml.includes('<meta property="og:url" content="https://college-project-frontend-9hme.onrender.com/">'),
    "Homepage contains full Open Graph sharing metadata with frontend domain"
  );
  assert(
    indexHtml.includes('<meta name="twitter:card" content="summary_large_image"') &&
    indexHtml.includes('<meta name="twitter:image"'),
    "Homepage contains Twitter/X Card sharing metadata"
  );
  assert(
    indexHtml.includes('<link rel="icon" type="image/svg+xml" href="favicon.svg">'),
    "Homepage references branded favicon asset"
  );

  // 2. Semantic Document Structure & Content
  console.log("\n▶ TEST SUITE 2: Semantic HTML Structure & Public Copy");
  const h1Matches = indexHtml.match(/<h1[^>]*>.*?<\/h1>/gis);
  assert(h1Matches && h1Matches.length === 1, "Homepage contains exactly one clear H1 heading");

  assert(
    indexHtml.includes("<header") &&
    indexHtml.includes("<nav") &&
    indexHtml.includes("<main") &&
    indexHtml.includes("<footer"),
    "Homepage uses semantic HTML5 container elements (header, nav, main, footer)"
  );
  assert(
    /How the\s+Admission Process Works/i.test(indexHtml) &&
    indexHtml.includes("No application fee is required"),
    "Public admission guidance accurately reflects the zero application fee policy"
  );

  // 3. Structured Data Validation (JSON-LD)
  console.log("\n▶ TEST SUITE 3: JSON-LD Structured Data Schema");
  const jsonLdMatch = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert(Boolean(jsonLdMatch), "Homepage contains JSON-LD structured data script block");
  let jsonLdValid = false;
  try {
    const parsed = JSON.parse(jsonLdMatch[1]);
    const graph = parsed["@graph"] || [parsed];
    const hasWebsite = graph.some(item => item["@type"] === "WebSite");
    const hasApp = graph.some(item => item["@type"] === "WebApplication");
    jsonLdValid = hasWebsite && hasApp;
  } catch (e) {
    console.error("JSON-LD parse error:", e);
  }
  assert(jsonLdValid, "JSON-LD parses cleanly and defines WebSite and WebApplication entities");

  // 4. robots.txt and sitemap.xml files
  console.log("\n▶ TEST SUITE 4: Crawler Directives (robots.txt & sitemap.xml)");
  const robotsTxt = fs.readFileSync(path.join(rootDir, "robots.txt"), "utf8");
  assert(
    robotsTxt.includes("User-agent: *") &&
    robotsTxt.includes("Disallow: /auth") &&
    robotsTxt.includes("Disallow: /portal") &&
    robotsTxt.includes("Disallow: /api/") &&
    robotsTxt.includes("Sitemap: https://college-project-frontend-9hme.onrender.com/sitemap.xml"),
    "robots.txt disallows private routes and references frontend sitemap.xml"
  );

  const sitemapXml = fs.readFileSync(path.join(rootDir, "sitemap.xml"), "utf8");
  assert(
    sitemapXml.includes("<loc>https://college-project-frontend-9hme.onrender.com/</loc>") &&
    !sitemapXml.includes("localhost") &&
    !sitemapXml.includes("portal.html") &&
    !sitemapXml.includes("auth.html") &&
    !sitemapXml.includes("college-project-backend-1.onrender.com"),
    "sitemap.xml lists only public frontend canonical URL and excludes private paths and backend URLs"
  );

  // 5. Private Page Indexing Protection (HTML meta tag)
  console.log("\n▶ TEST SUITE 5: Private Page noindex Protection");
  const authHtml = fs.readFileSync(path.join(rootDir, "auth.html"), "utf8");
  const portalHtml = fs.readFileSync(path.join(rootDir, "portal.html"), "utf8");
  assert(
    authHtml.includes('<meta name="robots" content="noindex, nofollow'),
    "auth.html contains noindex, nofollow robots meta tag"
  );
  assert(
    portalHtml.includes('<meta name="robots" content="noindex, nofollow'),
    "portal.html contains noindex, nofollow robots meta tag"
  );

  // 6. Live HTTP Endpoint Tests
  console.log("\n▶ TEST SUITE 6: Live HTTP Header & Routing Verification");
  const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
  assert(
    robotsRes.status === 200 && robotsRes.headers.get("content-type")?.includes("text/plain"),
    "/robots.txt served with HTTP 200 and text/plain"
  );

  const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
  assert(
    sitemapRes.status === 200 && sitemapRes.headers.get("content-type")?.includes("xml"),
    "/sitemap.xml served with HTTP 200 and XML content type"
  );

  const indexRedirectRes = await fetch(`${BASE_URL}/index.html`, { redirect: "manual" });
  assert(
    indexRedirectRes.status === 301 && indexRedirectRes.headers.get("location") === "/",
    "/index.html 301 redirects to canonical root /"
  );

  const apiHeaderRes = await fetch(`${BASE_URL}/api/health`);
  assert(
    apiHeaderRes.headers.get("x-robots-tag")?.includes("noindex"),
    "/api/* endpoints return X-Robots-Tag: noindex header"
  );

  const portalHeaderRes = await fetch(`${BASE_URL}/portal`);
  assert(
    portalHeaderRes.headers.get("x-robots-tag")?.includes("noindex"),
    "/portal endpoint returns X-Robots-Tag: noindex header"
  );

  const rootRes = await fetch(`${BASE_URL}/`);
  assert(
    rootRes.headers.get("link")?.includes("https://college-project-frontend-9hme.onrender.com/"),
    "Root endpoint sends canonical Link HTTP header pointing to public frontend"
  );

  const faviconRes = await fetch(`${BASE_URL}/favicon.svg`);
  assert(faviconRes.status === 200, "Favicon asset /favicon.svg is publicly reachable");

  const ogImageRes = await fetch(`${BASE_URL}/og-image.png`);
  assert(ogImageRes.status === 200, "Open Graph asset /og-image.png is publicly reachable");

  console.log("\n=======================================================");
  console.log(`🏁 TECHNICAL SEO TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("=======================================================");

  process.exitCode = testsFailed > 0 ? 1 : 0;
  if (srvInstance) {
    srvInstance.closeAllConnections?.();
    srvInstance.close();
  }
}

run().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
