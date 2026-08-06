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
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';
import { parseMaxFileBytes } from './file-upload.util';
import { parseUploadContext, parseUploadPreset } from './image-optimize.util';
import { DeleteImageDto } from './dto/delete-image.dto';

/**
 * Platform-wide image upload (CRM, PM, HRMS, Social, Wiki).
 * Images are resized/compressed before Cloudinary or local storage.
 */
@Controller('uploads')
export class MediaUploadsController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Get('limits')
  @UseGuards(JwtAuthGuard)
  getLimits() {
    return this.cloudinary.getLimits();
  }

  /** @deprecated use GET /uploads/limits */
  @Get('image/limits')
  @UseGuards(JwtAuthGuard)
  getImageLimits() {
    return this.cloudinary.getLimits();
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
    return this.cloudinary.uploadFile(file, folder, { preset: optimizePreset });
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
    return this.cloudinary.uploadDocument(file, folder);
  }

  @Delete('image')
  @UseGuards(JwtAuthGuard)
  async deleteImage(@Body() body: DeleteImageDto) {
    return this.cloudinary.deleteImage({
      url: body.url,
      publicId: body.publicId,
    });
  }

  @Delete('file')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@Body() body: DeleteImageDto) {
    return this.cloudinary.deleteMedia({
      url: body.url,
      publicId: body.publicId,
      kind: 'file',
    });
  }

  @Get(':filename')
  async serveImage(@Param('filename') filename: string, @Res() res: Response) {
    const upload = await this.cloudinary.getLocalUpload(filename);
    if (!upload) {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', upload.mimeType);
    res.setHeader('Content-Length', upload.size);
    res.send(upload.data);
  }

  @Get('files/:filename')
  async serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const upload = await this.cloudinary.getLocalUpload(`files/${filename}`);
    if (!upload) {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', upload.mimeType);
    res.setHeader('Content-Length', upload.size);
    res.send(upload.data);
  }
}
