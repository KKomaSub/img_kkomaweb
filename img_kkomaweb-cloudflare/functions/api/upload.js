import { cleanFilename, decodeBase64Utf8, json, noContent, text } from "../_lib/common.js";
import { getBestRawUrlFromUploadData, getImgbbKey, parseImgbbRawUrl } from "../_lib/imgbb.js";
import { isApng } from "../_lib/image-handler.js";

function normalizeUploadName(filename, fileKind) {
  const clean = cleanFilename(filename, "upload.png");
  if (fileKind === "apng" && !/\.png$/i.test(clean)) {
    return clean.replace(/\.[^.]+$/, "") + ".png";
  }
  return clean;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return noContent();
  if (request.method !== "POST") return text("Method not allowed", 405, { Allow: "POST, OPTIONS" });

  const encodedName = request.headers.get("X-File-Name") || "";
  const fileKind = (request.headers.get("X-File-Kind") || "image").toLowerCase();
  const originalMime = request.headers.get("X-Original-Mime") || request.headers.get("Content-Type") || "application/octet-stream";

  let filename;
  try {
    filename = decodeBase64Utf8(encodedName) || "upload.png";
  } catch {
    return json({ error: "Invalid filename encoding" }, 400);
  }

  filename = normalizeUploadName(filename, fileKind);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Empty file" }, 400);

  const detectedApng = isApng(bytes);
  const uploadType = fileKind === "apng" || detectedApng ? "image/png" : (request.headers.get("Content-Type") || originalMime || "application/octet-stream");

  const form = new FormData();
  form.append("image", new Blob([bytes], { type: uploadType }), filename);

  const apiKey = getImgbbKey(env);
  const result = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: form
  });

  let payload;
  try {
    payload = await result.json();
  } catch {
    return json({ error: "imgbb returned non-JSON response", status: result.status }, 502);
  }

  if (!result.ok || payload?.success === false) {
    return json({ error: "imgbb upload failed", status: result.status, detail: payload }, 502);
  }

  const rawUrl = getBestRawUrlFromUploadData(payload.data);
  const parsed = parseImgbbRawUrl(rawUrl);
  const id = payload.data?.id || parsed.id;
  const name = parsed.name;

  if (!id) {
    return json({ error: "Unable to parse imgbb id", detail: payload }, 502);
  }

  return json({
    ok: true,
    id,
    name,
    isApng: fileKind === "apng" || detectedApng,
    originalMime,
    uploadedFilename: filename,
    shareUrl: `/?id=${encodeURIComponent(id)}`,
    rawUrl: `/?id=${encodeURIComponent(id)}&raw=1`,
    mp4Url: fileKind === "apng" || detectedApng ? `/?id=${encodeURIComponent(id)}&format=mp4` : null,
    imgbbViewerUrl: payload.data?.url_viewer || `https://ibb.co/${encodeURIComponent(id)}`
  });
}
