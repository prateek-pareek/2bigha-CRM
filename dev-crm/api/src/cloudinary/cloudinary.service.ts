import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import axios from 'axios';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import sharp from 'sharp';
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
  publicId?: string;
  storage: 'cloudinary' | 'local';
  kind: 'file';
};

export type ImageUploadResult = {
  url: string;
  filename: string;
  publicId?: string;
  storage: 'cloudinary' | 'local';
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

@Injectable()
export class CloudinaryService {
  private readonly log = new Logger(CloudinaryService.name);
  private readonly configured: boolean;
  private readonly baseFolder: string;
  private readonly uploadsDir = join(process.cwd(), 'uploads');
  readonly maxInputBytes: number;
  readonly maxFileBytes: number;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Upload.name) private readonly uploadModel: Model<UploadDocument>,
  ) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    this.baseFolder =
      this.config.get<string>('CLOUDINARY_UPLOAD_FOLDER')?.trim() || 'mathionix';
    this.maxInputBytes =
      parseInt(this.config.get<string>('IMAGE_UPLOAD_MAX_INPUT_BYTES') || '', 10) ||
      15 * 1024 * 1024;
    this.maxFileBytes = parseMaxFileBytes();

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      this.configured = true;
      this.log.log('Cloudinary image storage enabled');
    } else {
      this.configured = false;
      this.log.warn(
        'Cloudinary not configured — image uploads will be stored locally in ./uploads',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /** Generative AI: text prompt → image bytes (requires Cloudinary AI add-on). */
  async generateImageFromPrompt(
    prompt: string,
    width: number,
    height: number,
  ): Promise<Buffer> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }

    const w = Math.min(Math.max(width || 1024, 256), 2048);
    const h = Math.min(Math.max(height || 1024, 256), 2048);
    const baseSide = Math.min(w, h, 768);
    const baseBuffer = await sharp({
      create: {
        width: baseSide,
        height: baseSide,
        channels: 3,
        background: { r: 232, g: 235, b: 240 },
      },
    })
      .png()
      .toBuffer();

    const effectPrompt = this.escapeGenAiPrompt(prompt);
    const effect = `gen_background_replace:prompt_${effectPrompt}`;

    const folder = `${this.baseFolder}/ai-gen-temp`;
    const publicId = `seed-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

    let upload: UploadApiResponse;
    try {
      upload = await cloudinary.uploader.upload(
        `data:image/png;base64,${baseBuffer.toString('base64')}`,
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
          overwrite: true,
          transformation: [{ effect, width: w, height: h, crop: 'fill' }],
        },
      );
    } catch (err) {
      this.log.error(`Cloudinary AI generate failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Cloudinary AI image generation failed. Ensure Generative AI is enabled on your Cloudinary account.',
      );
    }

    const imageUrl = upload.secure_url || upload.url;
    if (!imageUrl) {
      throw new ServiceUnavailableException('Cloudinary returned no image URL');
    }

    const res = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });
    return Buffer.from(res.data);
  }

  private escapeGenAiPrompt(prompt: string): string {
    return String(prompt || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
      .replace(/,/g, '%2C')
      .replace(/;/g, '%3B')
      .replace(/:/g, '%3A');
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

  /** PDF, Word, Excel, CSV, TXT, ZIP — stored as Cloudinary raw or local files/. */
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

    if (this.configured) {
      try {
        const folder = `${this.baseFolder}/${subfolder}/files`;
        const dataUri = `data:${mimeType};base64,${file.buffer.toString('base64')}`;
        const result = await cloudinary.uploader.upload(dataUri, {
          folder,
          public_id: storedName.replace(/\.[^.]+$/, ''),
          resource_type: 'raw',
          overwrite: false,
        });
        return {
          url: result.secure_url,
          filename: result.public_id?.split('/').pop() || storedName,
          originalName,
          mimeType,
          size: file.buffer.length,
          publicId: result.public_id,
          storage: 'cloudinary',
          kind: 'file',
        };
      } catch (err) {
        this.log.error(`Cloudinary file upload failed: ${(err as Error).message}`);
        throw new ServiceUnavailableException('File upload to Cloudinary failed');
      }
    }

    await this.uploadModel.create({
      filename: `files/${storedName}`,
      originalName,
      mimeType,
      data: file.buffer,
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

  /** Upload raw image bytes (e.g. AI-generated PNG), optimized before storage. */
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

    const subfolder = options.subfolder || 'uploads';
    const filename = this.buildFilename(ext, options.originalName);

    if (this.configured) {
      try {
        const folder = `${this.baseFolder}/${subfolder}`;
        const dataUri = `data:${mime};base64,${uploadBuffer.toString('base64')}`;
        const result = await cloudinary.uploader.upload(dataUri, {
          folder,
          public_id: filename.replace(/\.[^.]+$/, ''),
          resource_type: 'image',
          overwrite: false,
        });
        return {
          ...this.fromCloudinary(result, filename),
          width,
          height,
          originalBytes,
          optimizedBytes,
          optimized: wasOptimized,
        };
      } catch (err) {
        this.log.error(`Cloudinary upload failed: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Image upload to Cloudinary failed');
      }
    }

    return {
      ...(await this.saveLocal(uploadBuffer, filename, options.originalName, mime)),
      width,
      height,
      originalBytes,
      optimizedBytes,
      optimized: wasOptimized,
    };
  }

  private fromCloudinary(
    result: UploadApiResponse,
    fallbackFilename: string,
  ): Pick<ImageUploadResult, 'url' | 'filename' | 'publicId' | 'storage'> {
    return {
      url: result.secure_url,
      filename: result.public_id?.split('/').pop() || fallbackFilename,
      publicId: result.public_id,
      storage: 'cloudinary',
    };
  }

  private async saveLocal(
    buffer: Buffer,
    filename: string,
    originalName?: string,
    mime?: string,
  ): Promise<Pick<ImageUploadResult, 'url' | 'filename' | 'storage'>> {
    const mimeType = mime || this.mimeFromExt(extname(filename).replace(/^\./, ''));
    await this.uploadModel.create({
      filename,
      originalName: originalName || filename,
      mimeType,
      data: buffer,
      size: buffer.length,
    });
    return {
      url: `/uploads/${filename}`,
      filename,
      storage: 'local',
    };
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
    publicId?: string;
  }): Promise<{ deleted: boolean; storage?: 'cloudinary' | 'local'; reason?: string }> {
    return this.deleteMedia({ ...input, kind: 'image' });
  }

  /** Delete image or document from Cloudinary / local storage. */
  async deleteMedia(input: {
    url?: string;
    publicId?: string;
    kind?: 'image' | 'file' | 'auto';
  }): Promise<{ deleted: boolean; storage?: 'cloudinary' | 'local'; reason?: string }> {
    const publicId = input.publicId?.trim();
    const url = input.url?.trim();
    const kind =
      input.kind === 'auto' || !input.kind
        ? this.inferMediaKind(url, publicId)
        : input.kind;

    if (publicId) {
      return this.deleteCloudinaryPublicId(
        publicId,
        kind === 'file' ? 'raw' : 'image',
      );
    }
    if (!url) {
      throw new BadRequestException('url or publicId is required');
    }

    if (this.isLocalUploadUrl(url)) {
      return this.deleteLocalFile(url);
    }
    if (this.isOurCloudinaryMediaUrl(url)) {
      return this.deleteCloudinaryByUrl(
        url,
        url.includes('/raw/upload/') ? 'raw' : 'image',
      );
    }

    return { deleted: false, reason: 'external_url' };
  }

  private inferMediaKind(
    url?: string,
    publicId?: string,
  ): 'image' | 'file' {
    if (url?.includes('/raw/upload/')) return 'file';
    if (publicId?.includes('/files/')) return 'file';
    return 'image';
  }

  private isOurCloudinaryMediaUrl(url: string): boolean {
    if (!this.configured) return false;
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    if (!cloudName) return false;
    try {
      const host = new URL(url).hostname;
      return (
        host === 'res.cloudinary.com' &&
        (url.includes('/image/upload/') || url.includes('/raw/upload/')) &&
        url.includes(`res.cloudinary.com/${cloudName}/`)
      );
    } catch {
      return false;
    }
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

  private assertManagedPublicId(publicId: string): void {
    const normalized = publicId.replace(/^\/+/, '');
    const prefix = `${this.baseFolder}/`;
    if (!normalized.startsWith(prefix)) {
      throw new BadRequestException(
        'Only images uploaded through this application can be deleted',
      );
    }
  }

  private async deleteCloudinaryPublicId(
    publicId: string,
    resourceType: 'image' | 'raw' = 'image',
  ): Promise<{ deleted: boolean; storage: 'cloudinary' }> {
    if (!this.configured) {
      throw new ServiceUnavailableException('Cloudinary is not configured');
    }
    this.assertManagedPublicId(publicId);
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      });
      const deleted = result.result === 'ok' || result.result === 'not found';
      if (result.result === 'ok') {
        this.log.log(`Deleted Cloudinary image ${publicId}`);
      }
      return { deleted, storage: 'cloudinary' };
    } catch (err) {
      this.log.error(`Cloudinary delete failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Failed to delete image from Cloudinary');
    }
  }

  /** Parse public_id from res.cloudinary.com image/raw URLs (SDK v2 has no public_id_from_url). */
  private parseCloudinaryPublicId(url: string): string {
    const withoutQuery = url.split('?')[0];
    const marker = '/upload/';
    const i = withoutQuery.indexOf(marker);
    if (i < 0) {
      throw new BadRequestException('Could not parse Cloudinary media URL');
    }
    const segments = withoutQuery.slice(i + marker.length).split('/');
    const kept: string[] = [];
    for (const seg of segments) {
      if (!seg || /^v\d+$/.test(seg)) continue;
      if (seg.includes(',') || /^[a-z0-9]+_[a-z0-9_,]+$/i.test(seg)) continue;
      kept.push(seg);
    }
    if (!kept.length) {
      throw new BadRequestException('Could not resolve Cloudinary public_id');
    }
    const joined = kept.join('/');
    const dot = joined.lastIndexOf('.');
    return dot > joined.lastIndexOf('/') ? joined.slice(0, dot) : joined;
  }

  private async deleteCloudinaryByUrl(
    url: string,
    resourceType: 'image' | 'raw' = 'image',
  ): Promise<{ deleted: boolean; storage: 'cloudinary' }> {
    const publicId = this.parseCloudinaryPublicId(url);
    return this.deleteCloudinaryPublicId(publicId, resourceType);
  }

  private async deleteLocalFile(
    url: string,
  ): Promise<{ deleted: boolean; storage: 'local'; reason?: string }> {
    const filename = this.localUploadPath(url);
    if (!filename) {
      return { deleted: false, storage: 'local', reason: 'invalid_path' };
    }
    const res = await this.uploadModel.deleteOne({ filename }).exec();
    if (res.deletedCount > 0) {
      this.log.log(`Deleted database upload ${filename}`);
      return { deleted: true, storage: 'local' };
    }
    return { deleted: false, storage: 'local', reason: 'not_found' };
  }

  async getLocalUpload(filename: string): Promise<UploadDocument | null> {
    return this.uploadModel.findOne({ filename }).exec();
  }
}
