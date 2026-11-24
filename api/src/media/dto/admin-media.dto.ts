import { IsIn, IsOptional, Matches } from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { FOLDER } from './media-fields.dto';
import { MediaDto } from './media.dto';

/** An image as the admin app shows it: the public fields plus the file's details. */
export class AdminMediaDto extends MediaDto {
  /** The uploader's file name. @example "borscht.jpg" */
  name: string;
  /** @example "products" */
  folder: string | null;
  /** @example "image/jpeg" */
  mime: string;
  /** Bytes. @example 182733 */
  size: number;
  createdAt: Date;
}

export const MEDIA_SORTS = ['id', 'createdAt', 'name', 'size'] as const;

export class AdminMediaQueryDto extends AdminListQueryDto {
  /** Newest first unless told otherwise. */
  @IsOptional()
  @IsIn(MEDIA_SORTS)
  sort: string = 'createdAt';

  /** Only this folder. @example "products" */
  @IsOptional()
  @Matches(FOLDER)
  folder?: string;
}
