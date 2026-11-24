import type { User } from '@/users/entities/user.entity';
import type { AdminUserDto } from '../dto/admin-user.dto';

/** Field by field: the hash (even if loaded) never reaches a response. */
export function toAdminUserDto(user: User): AdminUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    phone: user.phone,
    address: user.address,
    role: user.role,
    blocked: user.blocked,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
