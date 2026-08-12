import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, extname, join } from 'path';
import { Upload, UploadDocument } from './schemas/upload.schema';
import {
  assertAllowedFileMime,
  fileExtFromMime,
  parseMaxFileBytes,
} from './file-upload.util';
import {
  formatBytes,
  ImageOptimizeOptions,
  ImageOptimizePreset,
  optimizeImageBuffer,
} from './image-optimize.util';

export type FileUploadResult = {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storage: 'local';
  kind: 'file';
};

export type ImageUploadResult = {
  url: string;
  filename: string;
  storage: 'local';
  width?: number;
  height?: number;
  originalBytes?: number;
  optimizedBytes?: number;
  optimized?: boolean;
};

export type ImageUploadLimits = {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxDimension: number;
  presets: Record<ImageOptimizePreset, { maxDimension: number; maxOutputBytes: number }>;
};

const IMAGE_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/i;

/** All uploaded files/images live under this directory on the server's own disk. */
export const UPLOADS_DIR = join(process.cwd(), 'uploads');

/**
 * Stores every uploaded image/file on this server's local filesystem
 * (./uploads) — no third-party storage provider is used.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly uploadsDir = UPLOADS_DIR;
  readonly maxInputBytes: number;
  readonly maxFileBytes: number;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Upload.name) private readonly uploadModel: Model<UploadDocument>,
  ) {
    this.maxInputBytes =
      parseInt(this.config.get<string>('IMAGE_UPLOAD_MAX_INPUT_BYTES') || '', 10) ||
      15 * 1024 * 1024;
    this.maxFileBytes = parseMaxFileBytes();

    this.ensureDir(this.uploadsDir);
    this.log.log(`Local disk storage enabled (${this.uploadsDir})`);
  }

  getLimits(): ImageUploadLimits & { maxFileBytes: number; allowedFileMimes: string[] } {
    return {
      maxInputBytes: this.maxInputBytes,
      maxFileBytes: this.maxFileBytes,
      maxOutputBytes: 2 * 1024 * 1024,
      maxDimension: 1920,
      allowedFileMimes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
        'application/zip',
      ],
      presets: {
        default: { maxDimension: 1920, maxOutputBytes: 2 * 1024 * 1024 },
        cover: { maxDimension: 2048, maxOutputBytes: 2.5 * 1024 * 1024 },
        avatar: { maxDimension: 512, maxOutputBytes: 256 * 1024 },
        inline: { maxDimension: 1280, maxOutputBytes: 1 * 1024 * 1024 },
      },
    };
  }

  /** PDF, Word, Excel, CSV, TXT, ZIP — stored under uploads/files/ on local disk. */
  async uploadDocument(
    file: Express.Multer.File,
    subfolder = 'files',
  ): Promise<FileUploadResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File upload failed');
    }
    assertAllowedFileMime(file.mimetype);
    if (file.buffer.length > this.maxFileBytes) {
      throw new BadRequestException(
        `File is too large (${formatBytes(file.buffer.length)}). Max ${formatBytes(this.maxFileBytes)}.`,
      );
    }

    const mimeType = (file.mimetype || 'application/octet-stream').split(';')[0].trim();
    const ext = extname(file.originalname || '') || `.${fileExtFromMime(mimeType)}`;
    const storedName = this.buildFilename(ext.replace(/^\./, ''), file.originalname);
    const originalName = file.originalname || storedName;

    const filename = `files/${storedName}`;
    await this.writeToDisk(filename, file.buffer);
    await this.uploadModel.create({
      filename,
      originalName,
      mimeType,
      size: file.buffer.length,
    });
    return {
      url: `/uploads/files/${storedName}`,
      filename: storedName,
      originalName,
      mimeType,
      size: file.buffer.length,
      storage: 'local',
      kind: 'file',
    };
  }

  assertImageMime(mimetype: string | undefined): void {
    if (!mimetype || !IMAGE_MIME.test(mimetype)) {
      throw new BadRequestException(
        'Only image files are allowed (jpg, jpeg, png, gif, webp)',
      );
    }
  }

  assertInputSize(bytes: number): void {
    if (bytes > this.maxInputBytes) {
      throw new BadRequestException(
        `Image is too large (${formatBytes(bytes)}). Max upload size is ${formatBytes(this.maxInputBytes)}.`,
      );
    }
  }

  /** Upload a multer file (memory storage), optimized before storage. */
  async uploadFile(
    file: Express.Multer.File,
    subfolder = 'uploads',
    optimize: ImageOptimizeOptions = {},
  ): Promise<ImageUploadResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File upload failed');
    }
    this.assertImageMime(file.mimetype);
    this.assertInputSize(file.buffer.length);

    const optimized = await optimizeImageBuffer(file.buffer, file.mimetype, optimize);
    if (optimized.optimized) {
      this.log.debug(
        `Optimized ${file.originalname || 'image'}: ${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.optimizedBytes)}`,
      );
    }

    return this.uploadBuffer(optimized.buffer, {
      subfolder,
      ext: optimized.ext,
      originalName: file.originalname,
      mime: optimized.mime,
      width: optimized.width,
      height: optimized.height,
      originalBytes: optimized.originalBytes,
      optimizedBytes: optimized.optimizedBytes,
      wasOptimized: optimized.optimized,
    });
  }

  /** Upload raw image bytes (e.g. server-generated PNG), optimized before storage. */
  async uploadBuffer(
    buffer: Buffer,
    options: {
      subfolder?: string;
      ext?: string;
      originalName?: string;
      mime?: string;
      width?: number;
      height?: number;
      originalBytes?: number;
      optimizedBytes?: number;
      wasOptimized?: boolean;
      skipOptimize?: boolean;
      optimize?: ImageOptimizeOptions;
    } = {},
  ): Promise<ImageUploadResult> {
    if (!buffer?.length) {
      throw new BadRequestException('Empty image buffer');
    }

    let uploadBuffer = buffer;
    let ext = (options.ext || 'png').replace(/^\./, '');
    let mime = options.mime || this.mimeFromExt(ext);
    let width = options.width;
    let height = options.height;
    let originalBytes = options.originalBytes ?? buffer.length;
    let optimizedBytes = options.optimizedBytes ?? buffer.length;
    let wasOptimized = options.wasOptimized ?? false;

    if (!options.skipOptimize && !options.wasOptimized) {
      this.assertInputSize(buffer.length);
      const optimized = await optimizeImageBuffer(buffer, mime, {
        preset: 'cover',
        ...options.optimize,
      });
      uploadBuffer = optimized.buffer;
      ext = optimized.ext;
      mime = optimized.mime;
      width = optimized.width;
      height = optimized.height;
      originalBytes = optimized.originalBytes;
      optimizedBytes = optimized.optimizedBytes;
      wasOptimized = optimized.optimized;
    }

    const filename = this.buildFilename(ext, options.originalName);

    return {
      ...(await this.saveLocal(uploadBuffer, filename, options.originalName, mime)),
      width,
      height,
      originalBytes,
      optimizedBytes,
      optimized: wasOptimized,
    };
  }

  private async saveLocal(
    buffer: Buffer,
    filename: string,
    originalName?: string,
    mime?: string,
  ): Promise<Pick<ImageUploadResult, 'url' | 'filename' | 'storage'>> {
    const mimeType = mime || this.mimeFromExt(extname(filename).replace(/^\./, ''));
    await this.writeToDisk(filename, buffer);
    await this.uploadModel.create({
      filename,
      originalName: originalName || filename,
      mimeType,
      size: buffer.length,
    });
    return {
      url: `/uploads/${filename}`,
      filename,
      storage: 'local',
    };
  }

  private ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  /** Write bytes to `uploads/{relativePath}` on local disk, creating subfolders as needed. */
  private async writeToDisk(relativePath: string, buffer: Buffer): Promise<void> {
    const fullPath = join(this.uploadsDir, relativePath);
    this.ensureDir(dirname(fullPath));
    writeFileSync(fullPath, buffer);
  }

  private buildFilename(ext: string, originalName?: string): string {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    if (originalName) {
      const base = originalName
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
      const parsedExt = extname(base) || `.${ext}`;
      const stem = base.replace(parsedExt, '') || 'image';
      return `${stem}-${suffix}.${ext}`;
    }
    const hash = createHash('sha256').update(suffix).digest('hex').slice(0, 8);
    return `img-${hash}-${suffix}.${ext}`;
  }

  private mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    return map[ext.toLowerCase()] || 'image/png';
  }

  /** Delete image (alias for deleteMedia). */
  async deleteImage(input: {
    url?: string;
  }): Promise<{ deleted: boolean; storage?: 'local'; reason?: string }> {
    return this.deleteMedia({ ...input, kind: 'image' });
  }

  /** Delete an image or document previously stored on local disk. No-op for external URLs. */
  async deleteMedia(input: {
    url?: string;
    kind?: 'image' | 'file' | 'auto';
  }): Promise<{ deleted: boolean; storage?: 'local'; reason?: string }> {
    const url = input.url?.trim();
    if (!url) {
      throw new BadRequestException('url is required');
    }

    if (this.isLocalUploadUrl(url)) {
      return this.deleteLocalFile(url);
    }

    return { deleted: false, reason: 'external_url' };
  }

  private isLocalUploadUrl(url: string): boolean {
    const path = this.localUploadPath(url);
    return !!path;
  }

  private localUploadPath(url: string): string | null {
    let pathname = url;
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        pathname = new URL(url).pathname;
      }
    } catch {
      return null;
    }
    const filesMatch = pathname.match(/\/uploads\/files\/([^/?#]+)$/);
    if (filesMatch?.[1]) {
      const name = filesMatch[1];
      if (!name.includes('..') && !name.includes('/')) return `files/${name}`;
    }
    const match = pathname.match(/\/uploads\/([^/?#]+)$/);
    if (!match?.[1]) return null;
    const filename = match[1];
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return null;
    }
    return filename;
  }

  private async deleteLocalFile(
    url: string,
  ): Promise<{ deleted: boolean; storage: 'local'; reason?: string }> {
    const filename = this.localUploadPath(url);
    if (!filename) {
      return { deleted: false, storage: 'local', reason: 'invalid_path' };
    }
    const res = await this.uploadModel.deleteOne({ filename }).exec();
    const fullPath = join(this.uploadsDir, filename);
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch (err) {
        this.log.warn(`Failed to remove file from disk ${fullPath}: ${(err as Error).message}`);
      }
    }
    if (res.deletedCount > 0) {
      this.log.log(`Deleted local upload ${filename}`);
      return { deleted: true, storage: 'local' };
    }
    return { deleted: false, storage: 'local', reason: 'not_found' };
  }

  async getLocalUpload(filename: string): Promise<UploadDocument | null> {
    return this.uploadModel.findOne({ filename }).exec();
  }
}
