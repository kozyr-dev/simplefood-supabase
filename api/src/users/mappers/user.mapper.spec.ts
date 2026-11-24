import { User, UserRole } from '../entities/user.entity';
import { toUserDto } from './user.mapper';

describe('toUserDto', () => {
  const createdAt = new Date('2026-10-01T10:00:00Z');
  const user = Object.assign(new User(), {
    id: 'user-1',
    name: 'Ivan',
    email: 'ivan@example.com',
    passwordHash: '$2b$12$secret',
    phone: '+380671234567',
    address: null,
    role: UserRole.Customer,
    blocked: false,
    emailVerifiedAt: null,
    createdAt,
    updatedAt: new Date(),
  });

  it('returns the profile fields only: no hash, no blocked flag', () => {
    expect(toUserDto(user)).toEqual({
      id: 'user-1',
      name: 'Ivan',
      email: 'ivan@example.com',
      emailVerified: false,
      phone: '+380671234567',
      address: null,
      role: 'customer',
      createdAt,
    });
  });

  it('reports the email verified once emailVerifiedAt is set', () => {
    const verified = Object.assign(new User(), user, {
      emailVerifiedAt: new Date('2026-10-02T10:00:00Z'),
    });
    expect(toUserDto(verified).emailVerified).toBe(true);
  });
});
