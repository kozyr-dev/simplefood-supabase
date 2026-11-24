import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { ToBoolean } from '@/common/http/query-transforms';

export class AdminContactMessageDto {
  id: string;
  name: string;
  /** Reply to it by email. */
  email: string;
  message: string;
  /** Read-only, from `handledAt`. */
  handled: boolean;
  handledAt: Date | null;
  createdAt: Date;
}

export class AdminContactMessagesQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(['id', 'createdAt', 'name'])
  sort: string = 'createdAt';

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  handled?: boolean;
}

export class UpdateContactMessageDto {
  /** true: dealt with (now); false: back to new. */
  @IsBoolean()
  handled: boolean;
}
