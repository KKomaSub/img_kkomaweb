import { CORS_HEADERS, contentDisposition, json, noContent, text } from "./common.js";
import { resolveImgbbRawUrl } from "./imgbb.js";

function isPng(bytes) {
  if (bytes.byteLength < 8) return false;
  const b = new Uint8Array(bytes, 0, 8);
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
}

export function isApng(bytes) {
  if (!isPng(bytes)) return false;
  const b = new Uint8Array(bytes);
  for (let i = 8; i + 8 < b.length; ) {
    const length = (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (type === "acTL") return true;
    if (type === "IDAT") return false;
    if (!Number.isFinite(length) || length < 0) break;
    i += 12 + length;
  }
  return false;
}

function filenameFromUrl(rawUrl, id, contentType, forceMp4 = false) {
  if (forceMp4) return `${id || "download"}.mp4`;
  try {
    const path = new URL(rawUrl).pathname;
    const last = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
    if (last) return last;
  } catch {}
  if (contentType?.includes("png")) return `${id}.png`;
  if (contentType?.includes("jpeg")) return `${id}.jpg`;
  if (contentType?.includes("gif")) return `${id}.gif`;
  if (contentType?.includes("webp")) return `${id}.webp`;
  return `${id || "download"}.bin`;
}

function looksLikeImageContentType(value) {
  return /^image\//i.test(value || "");
}

export async function handleImageRequest(request, env) {
  if (request.method === "OPTIONS") return noContent();
  if (request.method !== "GET" && request.method !== "HEAD") return text("Method not allowed", 405, { Allow: "GET, HEAD, OPTIONS" });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const name = url.searchParams.get("name") || "";
  const info = url.searchParams.get("info") === "1";
  const download = url.searchParams.get("download") === "1";
  const format = (url.searchParams.get("format") || "").toLowerCase();

  if (!id) return text("Missing id", 400);

  let rawUrl;
  try {
    rawUrl = await resolveImgbbRawUrl(id, name);
  } catch (err) {
    return json({ error: err.message, hint: "name 파라미터 없이 실패하면 기존 링크의 name을 한 번만 같이 전달해 주세요." }, 404);
  }

  const upstream = await fetch(rawUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 ImgKkomaWeb/2.0",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    },
    cf: { cacheTtl: 31536000, cacheEverything: true }
  });

  if (!upstream.ok) return text("Failed to fetch image", upstream.status);

  const contentType = upstream.headers.get("Content-Type") || "application/octet-stream";
  const bytes = await upstream.arrayBuffer();
  const apng = isApng(bytes);
  const filename = filenameFromUrl(rawUrl, id, contentType, false);
  const rawLink = `/?id=${encodeURIComponent(id)}&raw=1`;
  const mp4Link = `/?id=${encodeURIComponent(id)}&format=mp4`;

  if (info) {
    return json({
      id,
      filename,
      contentType,
      size: bytes.byteLength,
      isApng: apng,
      rawLink,
      mp4Link: apng ? mp4Link : null,
      serverMode: apng ? "raw-apng; mp4 conversion is delegated to browser ffmpeg.wasm" : "raw"
    }, 200, { "Cache-Control": "public, max-age=600" });
  }

  if (format === "mp4" && apng) {
    const convertUrl = new URL(request.url);
    convertUrl.pathname = "/convert.html";
    convertUrl.searchParams.set("id", id);
    convertUrl.searchParams.set("auto", "1");
    convertUrl.searchParams.delete("raw");
    convertUrl.searchParams.delete("format");
    return Response.redirect(convertUrl.toString(), 302);
  }

  const headers = new Headers(CORS_HEADERS);
  headers.set("Content-Type", looksLikeImageContentType(contentType) ? contentType : "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-ImgKkoma-APNG", apng ? "1" : "0");
  headers.set("Content-Disposition", contentDisposition(download ? "attachment" : "inline", filename));

  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(bytes, { status: 200, headers });
}
