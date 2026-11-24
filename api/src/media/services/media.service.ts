import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { MediaFieldsDto } from '../dto/media-fields.dto';
import { Media, type MediaFormats } from '../entities/media.entity';
import { MEDIA_STORAGE, type MediaStorage } from '../types/media.types';
import { displayName, fileNameOf, newFileBase, uploadUrl } from './file-names';
import { IMAGE_TYPES, processImage } from './image-processing';

/** The part of an uploaded file MediaService needs (multer's file fits). */
export interface UploadedImage {
  buffer: Buffer;
  originalname?: string;
}

/** An empty alt text is none. */
function altText(alt: string | null | undefined): string | null | undefined {
  return alt === '' ? null : alt;
}

/**
 * Uploaded images: processed (services/image-processing.ts), stored
 * (MEDIA_STORAGE) and recorded as Media rows. The upload route (also
 * used by the admin app) and the Strapi import go through it.
 *
 * Files are written before their row and removed after it, so a row never
 * points at a missing file; a file left behind by a failure is harmless.
 * Logs never name a file.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Stores an image and its smaller sizes. 400 `FILE_REQUIRED` without a
   * file; see processImage() for the 415 and the other 400s.
   */
  async upload(
    file: UploadedImage | undefined,
    { alt, folder }: MediaFieldsDto,
  ): Promise<Media> {
    if (!file) {
      throw new BadRequestException({
        message: 'Send the image in the `file` field',
        code: 'FILE_REQUIRED',
      });
    }
    const image = await processImage(file.buffer);
    const { mime, extension } = IMAGE_TYPES[image.type];
    const base = newFileBase();

    const files = [{ name: `${base}.${extension}`, data: image.original.data }];
    const formats: MediaFormats = {};
    for (const [variant, { data, width, height }] of Object.entries(
      image.variants,
    )) {
      const name = `${variant}_${base}.${extension}`;
      files.push({ name, data });
      formats[variant as keyof MediaFormats] = {
        url: uploadUrl(name),
        width,
        height,
      };
    }

    const saved: string[] = [];
    try {
      for (const { name, data } of files) {
        await this.storage.save(name, data);
        saved.push(name);
      }
      return await this.media.save(
        this.media.create({
          url: uploadUrl(files[0].name),
          name: displayName(file.originalname),
          mime,
          size: image.original.data.length,
          width: image.original.width,
          height: image.original.height,
          alt: altText(alt) ?? null,
          folder: folder ?? null,
          formats: Object.keys(formats).length ? formats : null,
        }),
      );
    } catch (error) {
      await this.removeFiles(saved);
      throw error;
    }
  }

  /** Changes the fields sent; `null` clears one. 404 for an unknown id. */
  async update(id: string, { alt, folder }: MediaFieldsDto): Promise<Media> {
    const media = await this.findOrFail(id);
    if (alt !== undefined) media.alt = altText(alt) ?? null;
    if (folder !== undefined) media.folder = folder;
    return this.media.save(media);
  }

  /**
   * Deletes the row, then its files. Whatever showed the image (a product,
   * a post, a page section) shows none from then on. 404 for an unknown id.
   */
  async remove(id: string): Promise<void> {
    const media = await this.findOrFail(id);
    await this.media.delete(id);

    const urls = [
      media.url,
      ...Object.values(media.formats ?? {}).map((format) => format.url),
    ];
    // Not ours to remove if it isn't a plain /uploads/<name> (never so far).
    await this.removeFiles(
      urls.map(fileNameOf).filter((name) => name !== null),
    );
  }

  private async findOrFail(id: string): Promise<Media> {
    const media = await this.media.findOneBy({ id });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    return media;
  }

  /** Best effort: a file left behind takes space, nothing else. */
  private async removeFiles(names: string[]): Promise<void> {
    const results = await Promise.allSettled(
      names.map((name) => this.storage.remove(name)),
    );
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) {
      const { code } = failed[0].reason as { code?: string };
      this.logger.warn(
        `Could not remove ${failed.length} media file(s): ${code ?? 'unknown error'}`,
      );
    }
  }
}
