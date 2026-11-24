import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { AdminListQueryDto } from '@/common/admin/admin-list-query.dto';
import { ToBoolean } from '@/common/http/query-transforms';
import { UserRole } from '@/users/entities/user.entity';

/** An account as admins see it. Never the password hash. */
export class AdminUserDto {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  address: string | null;
  role: UserRole;
  blocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminUsersQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(['id', 'name', 'email', 'role', 'createdAt'])
  sort: string = 'createdAt';

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  blocked?: boolean;
}

/** Only these change here; everything else is the owner's (PATCH /users/me). */
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  /** true ends every session of the account. */
  @IsOptional()
  @IsBoolean()
  blocked?: boolean;
}
