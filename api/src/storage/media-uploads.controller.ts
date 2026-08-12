import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Param,
  Res,
  NotFoundException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService, UPLOADS_DIR } from './storage.service';
import { parseMaxFileBytes } from './file-upload.util';
import { parseUploadContext, parseUploadPreset } from './image-optimize.util';
import { DeleteImageDto } from './dto/delete-image.dto';

/**
 * Platform-wide image/file upload (CRM, PM, HRMS, Social, Wiki).
 * Images are resized/compressed, then stored on this server's local disk.
 */
@Controller('uploads')
export class MediaUploadsController {
  constructor(private readonly storage: StorageService) {}

  @Get('limits')
  @UseGuards(JwtAuthGuard)
  getLimits() {
    return this.storage.getLimits();
  }

  /** @deprecated use GET /uploads/limits */
  @Get('image/limits')
  @UseGuards(JwtAuthGuard)
  getImageLimits() {
    return this.storage.getLimits();
  }

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize:
          parseInt(process.env.IMAGE_UPLOAD_MAX_INPUT_BYTES || '', 10) ||
          15 * 1024 * 1024,
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('context') context?: string,
    @Query('preset') preset?: string,
  ) {
    const folder = parseUploadContext(context);
    const optimizePreset = parseUploadPreset(preset);
    return this.storage.uploadFile(file, folder, { preset: optimizePreset });
  }

  @Post('file')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: parseMaxFileBytes() },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('context') context?: string,
  ) {
    const folder = parseUploadContext(context);
    return this.storage.uploadDocument(file, folder);
  }

  @Delete('image')
  @UseGuards(JwtAuthGuard)
  async deleteImage(@Body() body: DeleteImageDto) {
    return this.storage.deleteImage({ url: body.url });
  }

  @Delete('file')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@Body() body: DeleteImageDto) {
    return this.storage.deleteMedia({ url: body.url, kind: 'file' });
  }

  @Get(':filename')
  async serveImage(@Param('filename') filename: string, @Res() res: Response) {
    await this.streamUpload(filename, res);
  }

  @Get('files/:filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    await this.streamUpload(`files/${filename}`, res);
  }

  private async streamUpload(filename: string, res: Response): Promise<void> {
    const upload = await this.storage.getLocalUpload(filename);
    const fullPath = join(UPLOADS_DIR, filename);
    if (!upload || !existsSync(fullPath)) {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', upload.mimeType);
    res.setHeader('Content-Length', upload.size);
    createReadStream(fullPath).pipe(res);
  }
}
