let ffmpegPromise = null;
let ffmpegInstance = null;
let fetchFileFn = null;
let currentStatus = () => {};

const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "mpeg", "mpg", "3gp", "ogv", "ts"];

export function isConvertibleMedia(file) {
  const ext = extensionOf(file.name);
  return file.type.startsWith("video/") || file.type === "image/gif" || ext === "gif" || VIDEO_EXTENSIONS.includes(ext);
}

export function extensionOf(name = "") {
  return String(name).split(".").pop().toLowerCase();
}

export function basename(name = "file") {
  return String(name).replace(/\.[^.]+$/, "").replace(/[\\/\0\r\n]/g, "_") || "file";
}

export function encodeFilenameForHeader(name) {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function getFFmpeg(onStatus = () => {}) {
  currentStatus = onStatus;
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegPromise) return ffmpegPromise;

  ffmpegPromise = (async () => {
    onStatus("ffmpeg.wasm 로딩 중...");
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm"),
      import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm")
    ]);

    fetchFileFn = fetchFile;
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      if (/error|failed|invalid/i.test(message)) console.debug("[ffmpeg]", message);
    });
    ffmpeg.on("progress", ({ progress }) => {
      if (progress > 0 && progress <= 1) currentStatus(`변환 중... ${Math.round(progress * 100)}%`);
    });

    const coreBase = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm")
    });
    ffmpegInstance = ffmpeg;
    onStatus("ffmpeg.wasm 준비 완료");
    return ffmpeg;
  })();

  return ffmpegPromise;
}

async function safeDelete(ffmpeg, ...paths) {
  for (const path of paths) {
    try { await ffmpeg.deleteFile(path); } catch {}
  }
}

export async function convertMediaToApng(file, options = {}, onStatus = () => {}) {
  const ffmpeg = await getFFmpeg(onStatus);
  const fps = Math.max(1, Math.min(30, Number(options.fps) || 12));
  const maxWidth = Math.max(160, Math.min(1920, Number(options.maxWidth) || 720));
  const maxSeconds = Math.max(0, Math.min(300, Number(options.maxSeconds) || 15));

  const inputExt = extensionOf(file.name) || "bin";
  const inputName = `input-${Date.now()}.${inputExt}`;
  const outputName = `output-${Date.now()}.png`;
  await safeDelete(ffmpeg, inputName, outputName);

  onStatus("파일을 변환기에 넣는 중...");
  await ffmpeg.writeFile(inputName, await fetchFileFn(file));

  const vf = `fps=${fps},scale=min(${maxWidth}\\,iw):-2:flags=lanczos`;
  const args = ["-hide_banner"];
  if (maxSeconds > 0) args.push("-t", String(maxSeconds));
  args.push("-i", inputName, "-an", "-vf", vf, "-plays", "0", "-f", "apng", outputName);

  onStatus("동영상/GIF를 APNG(.png)로 변환 중...");
  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outputName);
  await safeDelete(ffmpeg, inputName, outputName);

  const outFileName = `${basename(file.name)}.png`;
  return new File([data], outFileName, { type: "image/png" });
}

async function convertWithArgs(ffmpeg, inputName, outputName, args) {
  await safeDelete(ffmpeg, outputName);
  await ffmpeg.exec(args);
  return await ffmpeg.readFile(outputName);
}

export async function convertApngUrlToMp4(apngUrl, outputBaseName = "download", onStatus = () => {}) {
  const ffmpeg = await getFFmpeg(onStatus);
  const response = await fetch(apngUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error(`APNG 다운로드 실패: ${response.status}`);

  const blob = await response.blob();
  const inputName = `apng-${Date.now()}.png`;
  const outputName = `mp4-${Date.now()}.mp4`;
  await safeDelete(ffmpeg, inputName, outputName);

  onStatus("APNG를 가져와 MP4로 변환 준비 중...");
  await ffmpeg.writeFile(inputName, await fetchFileFn(blob));

  const evenScale = "fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const primary = ["-hide_banner", "-i", inputName, "-an", "-vf", evenScale, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-movflags", "faststart", outputName];
  const fallback = ["-hide_banner", "-i", inputName, "-an", "-vf", evenScale, "-c:v", "mpeg4", "-q:v", "4", "-pix_fmt", "yuv420p", outputName];

  let data;
  try {
    onStatus("APNG → MP4 변환 중...");
    data = await convertWithArgs(ffmpeg, inputName, outputName, primary);
  } catch (primaryErr) {
    console.warn("libx264 변환 실패, mpeg4로 재시도", primaryErr);
    onStatus("MP4 변환 재시도 중...");
    data = await convertWithArgs(ffmpeg, inputName, outputName, fallback);
  }

  await safeDelete(ffmpeg, inputName, outputName);
  return new Blob([data], { type: "video/mp4" });
}
