import type { UserDto } from '../dto/user.dto';
import type { User } from '../entities/user.entity';

/** Field by field, so a new column never reaches a response by accident. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // Boolean(): a User built in code may not have the column set at all.
    emailVerified: Boolean(user.emailVerifiedAt),
    phone: user.phone,
    address: user.address,
    role: user.role,
    createdAt: user.createdAt,
  };
}
