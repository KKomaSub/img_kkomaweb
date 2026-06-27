import { handleImageRequest } from "../_lib/image-handler.js";

export async function onRequest(context) {
  return handleImageRequest(context.request, context.env);
}
