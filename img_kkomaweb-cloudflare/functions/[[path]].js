import { handleImageRequest } from "./_lib/image-handler.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hasRaw = url.searchParams.get("raw") === "1";
  const hasId = url.searchParams.has("id");

  // 공유 링크 그대로 "?id=...&raw=1"에 들어오면 HTML이 아니라 원본 raw 바이트만 반환한다.
  if (hasRaw && hasId) {
    url.pathname = "/api/image";
    url.searchParams.delete("raw");
    const request = new Request(url.toString(), context.request);
    return handleImageRequest(request, context.env);
  }

  return context.next();
}
