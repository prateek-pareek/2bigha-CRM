import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export type ImageOptimizePreset = 'default' | 'avatar' | 'cover' | 'inline';

export type ImageOptimizeOptions = {
  maxDimension?: number;
  maxOutputBytes?: number;
  quality?: number;
  preset?: ImageOptimizePreset;
};

export type OptimizedImage = {
  buffer: Buffer;
  ext: string;
  mime: string;
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
  optimized: boolean;
};

const PRESETS: Record<
  ImageOptimizePreset,
  { maxDimension: number; maxOutputBytes: number; quality: number }
> = {
  default: { maxDimension: 1920, maxOutputBytes: 2 * 1024 * 1024, quality: 82 },
  cover: { maxDimension: 2048, maxOutputBytes: 2.5 * 1024 * 1024, quality: 84 },
  avatar: { maxDimension: 512, maxOutputBytes: 256 * 1024, quality: 85 },
  inline: { maxDimension: 1280, maxOutputBytes: 1 * 1024 * 1024, quality: 80 },
};

function resolveOptions(options: ImageOptimizeOptions = {}) {
  const preset = PRESETS[options.preset || 'default'];
  return {
    maxDimension: options.maxDimension ?? preset.maxDimension,
    maxOutputBytes: options.maxOutputBytes ?? preset.maxOutputBytes,
    quality: options.quality ?? preset.quality,
  };
}

/** Resize & re-encode images to WebP/JPEG before storage. GIFs pass through (animation preserved). */
export async function optimizeImageBuffer(
  input: Buffer,
  mimetype: string,
  options: ImageOptimizeOptions = {},
): Promise<OptimizedImage> {
  const originalBytes = input.length;
  const mime = (mimetype || '').toLowerCase();

  if (mime === 'image/gif') {
    if (originalBytes > (options.maxOutputBytes ?? PRESETS.default.maxOutputBytes)) {
      throw new BadRequestException(
        `GIF is too large (${formatBytes(originalBytes)}). Max ${formatBytes(options.maxOutputBytes ?? PRESETS.default.maxOutputBytes)}.`,
      );
    }
    const meta = await sharp(input, { animated: true }).metadata();
    return {
      buffer: input,
      ext: 'gif',
      mime: 'image/gif',
      width: meta.width || 0,
      height: meta.height || 0,
      originalBytes,
      optimizedBytes: originalBytes,
      optimized: false,
    };
  }

  const { maxDimension, maxOutputBytes, quality } = resolveOptions(options);
  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  if (!width || !height) {
    throw new BadRequestException('Could not read image dimensions');
  }

  const needsResize = width > maxDimension || height > maxDimension;
  if (needsResize) {
    pipeline = pipeline.resize(maxDimension, maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let q = quality;
  let buffer = await pipeline.webp({ quality: q, effort: 4 }).toBuffer();
  let attempts = 0;
  while (buffer.length > maxOutputBytes && q > 50 && attempts < 6) {
    q -= 8;
    attempts += 1;
    pipeline = sharp(input, { failOn: 'none' }).rotate();
    if (needsResize) {
      const shrink = Math.max(0.65, 1 - attempts * 0.08);
      const dim = Math.round(maxDimension * shrink);
      pipeline = pipeline.resize(dim, dim, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    buffer = await pipeline.webp({ quality: q, effort: 4 }).toBuffer();
  }

  if (buffer.length > maxOutputBytes) {
    throw new BadRequestException(
      `Image is still too large after optimization (${formatBytes(buffer.length)}). Try a smaller file or resolution.`,
    );
  }

  const outMeta = await sharp(buffer).metadata();

  return {
    buffer,
    ext: 'webp',
    mime: 'image/webp',
    width: outMeta.width || width,
    height: outMeta.height || height,
    originalBytes,
    optimizedBytes: buffer.length,
    optimized: true,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseUploadContext(
  raw: string | undefined,
): 'crm' | 'social' | 'hrms' | 'pm' | 'wiki' | 'uploads' {
  const v = (raw || 'uploads').toLowerCase().trim();
  if (v === 'crm' || v === 'social' || v === 'hrms' || v === 'pm' || v === 'wiki') {
    return v;
  }
  return 'uploads';
}

export function parseUploadPreset(
  raw: string | undefined,
): ImageOptimizePreset {
  const v = (raw || 'default').toLowerCase().trim();
  if (v === 'avatar' || v === 'cover' || v === 'inline' || v === 'default') {
    return v;
  }
  return 'default';
}
