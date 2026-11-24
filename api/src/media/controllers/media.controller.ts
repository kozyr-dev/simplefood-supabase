import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { hours, Throttle } from '@nestjs/throttler';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AuthThrottlerGuard } from '@/auth/guards/auth-throttler.guard';
import { AdminInterceptor } from '@/auth/interceptors/admin.interceptor';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiAuth,
  ApiDataResponse,
  ApiRateLimited,
} from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { UserRole } from '@/users/entities/user.entity';
import { MediaFieldsDto } from '../dto/media-fields.dto';
import { MediaDto } from '../dto/media.dto';
import { toMediaDto } from '../mappers/media.mapper';
import { MAX_INPUT_PIXELS } from '../services/image-processing';
import { MediaService, type UploadedImage } from '../services/media.service';

/** Larger uploads are cut off while they arrive (413), never held in memory. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EDITORS = [UserRole.Admin, UserRole.Editor] as const;

/** Uploading, describing and deleting images: the site's editors only. */
@ApiTags('media')
@ApiAuth({ roles: EDITORS })
@Roles(...EDITORS)
// The admin app's writes: no-store answers, and each one in the audit log.
@UseInterceptors(AdminInterceptor)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Uploads a JPEG, PNG or WebP image (multipart/form-data, field `file`).
   * It is stored upright, at most 2560 px, without its metadata (camera,
   * GPS position), with `large`/`medium`/`small`/`thumbnail` copies when
   * it is bigger than those.
   */
  @Post()
  // Per account (see AuthThrottlerGuard): processing takes time and disk.
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: hours(1) } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 5,
        parts: 6,
        fieldSize: 2048,
      },
      // File names as browsers send them (UTF-8), not multer's Latin-1 default.
      defParamCharset: 'utf8',
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: `JPEG, PNG or WebP; at most 10 MB and ${MAX_INPUT_PIXELS / 1e6} megapixels.`,
        },
        alt: { type: 'string', maxLength: 500 },
        folder: { type: 'string', example: 'products' },
      },
    },
  })
  @ApiDataResponse(MediaDto, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'No file (`FILE_REQUIRED`), a damaged, animated or over-40-megapixel ' +
      'image (`INVALID_IMAGE`), invalid fields, or more than one file.',
  })
  @ApiPayloadTooLargeResponse({
    type: ErrorResponseDto,
    description: 'The file is over 10 MB (`PAYLOAD_TOO_LARGE`).',
  })
  @ApiUnsupportedMediaTypeResponse({
    type: ErrorResponseDto,
    description:
      'Not a JPEG, PNG or WebP image, whatever its name says (`UNSUPPORTED_MEDIA_TYPE`).',
  })
  @ApiRateLimited()
  async upload(
    // multer's file (memory storage), typed as much as MediaService needs.
    @UploadedFile() file: UploadedImage | undefined,
    @Body() fields: MediaFieldsDto,
  ): Promise<DataResponse<MediaDto>> {
    return { data: toMediaDto(await this.media.upload(file, fields)) };
  }

  /** Changes the alt text or folder; `null` clears one. */
  @Patch(':id')
  @ApiDataResponse(MediaDto)
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such image.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() fields: MediaFieldsDto,
  ): Promise<DataResponse<MediaDto>> {
    return { data: toMediaDto(await this.media.update(id, fields)) };
  }

  /**
   * Deletes an image and its files. Products, posts and page sections that
   * showed it show none from then on.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The image and its files are gone.' })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such image.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.media.remove(id);
  }
}
