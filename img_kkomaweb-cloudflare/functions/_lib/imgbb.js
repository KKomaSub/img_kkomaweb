import { cleanFilename } from "./common.js";

const FALLBACK_IMGBB_API_KEY = "03ecaa75934206c013c19cb81890da15";

export function getImgbbKey(env) {
  return env.IMGBB_API_KEY || FALLBACK_IMGBB_API_KEY;
}

export function parseImgbbRawUrl(rawUrl) {
  if (!rawUrl) return { id: "", name: "" };
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return {
      id: parts[0] || "",
      name: parts.slice(1).join("/") || ""
    };
  } catch {
    return { id: "", name: "" };
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\\\//g, "/");
}

function pickImageUrlFromHtml(html) {
  const metaPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["'][^>]*>/i
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  const matches = html.match(/https?:\\?\/\\?\/i\.ibb\.co\\?\/[^"'<>\s)]+/gi) || [];
  const normalized = matches.map(decodeHtmlEntities).map(url => url.replace(/^https:\/\//, "https://"));
  return normalized.find(url => /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url)) || normalized[0] || "";
}

export async function resolveImgbbRawUrl(id, name = "") {
  const cleanId = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId) throw new Error("Missing image id");

  if (name) {
    return `https://i.ibb.co/${cleanId}/${encodeURIComponent(cleanFilename(name))}`;
  }

  const viewerUrl = `https://ibb.co/${encodeURIComponent(cleanId)}`;
  const page = await fetch(viewerUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 ImgKkomaWeb/2.0 (+https://pages.cloudflare.com)",
      "Accept": "text/html,application/xhtml+xml"
    },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });

  if (!page.ok) {
    throw new Error(`imgbb viewer fetch failed: ${page.status}`);
  }

  const html = await page.text();
  const rawUrl = pickImageUrlFromHtml(html);
  if (!rawUrl) throw new Error("Unable to resolve imgbb raw URL without name parameter");
  return rawUrl;
}

export function getBestRawUrlFromUploadData(data) {
  return data?.image?.url || data?.url || data?.display_url || data?.thumb?.url || "";
}
