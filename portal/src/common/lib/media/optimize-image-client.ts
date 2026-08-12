export type ImageUploadPreset = "default" | "avatar" | "cover" | "inline";

export type ClientOptimizeOptions = {
  maxDimension?: number;
  maxBytes?: number;
  quality?: number;
  preset?: ImageUploadPreset;
};

const PRESETS: Record<
  ImageUploadPreset,
  { maxDimension: number; maxBytes: number; quality: number }
> = {
  default: { maxDimension: 1920, maxBytes: 2 * 1024 * 1024, quality: 0.82 },
  cover: { maxDimension: 2048, maxBytes: 2.5 * 1024 * 1024, quality: 0.84 },
  avatar: { maxDimension: 512, maxBytes: 256 * 1024, quality: 0.85 },
  inline: { maxDimension: 1280, maxBytes: 1 * 1024 * 1024, quality: 0.8 },
};

/** Hard cap before client-side work (matches API multer limit). */
export const IMAGE_UPLOAD_MAX_INPUT_BYTES = 15 * 1024 * 1024;

function resolve(opts: ClientOptimizeOptions = {}) {
  const p = PRESETS[opts.preset || "default"];
  return {
    maxDimension: opts.maxDimension ?? p.maxDimension,
    maxBytes: opts.maxBytes ?? p.maxBytes,
    quality: opts.quality ?? p.quality,
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress image"))),
      type,
      quality,
    );
  });
}

/**
 * Resize & compress in the browser before upload (saves bandwidth + server storage).
 * GIFs are returned unchanged (animation preserved; server enforces size cap).
 */
export async function optimizeImageFileClient(
  file: File,
  options: ClientOptimizeOptions = {},
): Promise<File> {
  if (file.size > IMAGE_UPLOAD_MAX_INPUT_BYTES) {
    throw new Error(
      `File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(IMAGE_UPLOAD_MAX_INPUT_BYTES)}.`,
    );
  }

  if (file.type === "image/gif") {
    const { maxBytes } = resolve(options);
    if (file.size > maxBytes) {
      throw new Error(
        `GIF is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(maxBytes)}.`,
      );
    }
    return file;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded");
  }

  const { maxDimension, maxBytes, quality } = resolve(options);

  if (
    file.size <= Math.min(maxBytes * 0.4, 200 * 1024) &&
    file.type === "image/webp"
  ) {
    return file;
  }

  const img = await loadImage(file);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) throw new Error("Invalid image dimensions");

  const scale = Math.min(1, maxDimension / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, w, h);

  const outputType = "image/webp";
  let q = quality;
  let blob = await canvasToBlob(canvas, outputType, q);

  while (blob.size > maxBytes && q > 0.45) {
    q -= 0.08;
    blob = await canvasToBlob(canvas, outputType, q);
  }

  if (blob.size > maxBytes) {
    throw new Error(
      `Image is still too large after compression (${formatBytes(blob.size)}). Try a smaller image.`,
    );
  }

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  const name = `${base}.webp`;

  return new File([blob], name, { type: outputType, lastModified: Date.now() });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
