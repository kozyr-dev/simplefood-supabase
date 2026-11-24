import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  type EntityManager,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { adminOrder, contains } from '@/common/admin/admin-list';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import { User, UserRole } from '@/users/entities/user.entity';
import type {
  AdminUserDto,
  AdminUsersQueryDto,
  UpdateUserDto,
} from '../dto/admin-user.dto';
import type { AuthUser } from '../types/auth.types';
import { toAdminUserDto } from '../mappers/admin-user.mapper';
import { AuthService } from './auth.service';
import { RefreshTokensService } from './refresh-tokens.service';

/**
 * Accounts, for admins: roles, blocking, and sending a reset link. Personal
 * fields stay the owner's to change.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly refreshTokens: RefreshTokensService,
    private readonly auth: AuthService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** `q`: part of the name or email. */
  async findAll(query: AdminUsersQueryDto): Promise<Paginated<AdminUserDto>> {
    const base: FindOptionsWhere<User> = {};
    if (query.id) base.id = In(query.id);
    if (query.role) base.role = query.role;
    if (query.blocked !== undefined) base.blocked = query.blocked;
    const where = query.q
      ? (['name', 'email'] as const).map((field) => ({
          ...base,
          [field]: contains(query.q as string),
        }))
      : [base];
    const [rows, total] = await this.users.findAndCount({
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(rows.map(toAdminUserDto), total, query);
  }

  async findOne(id: string): Promise<AdminUserDto> {
    return toAdminUserDto(await this.findOrFail(id, this.users));
  }

  /**
   * Changes the role or blocks/unblocks. A block or a role change ends
   * every session (their access token lives on, at most JWT_ACCESS_TTL).
   * Not on your own account (400 `OWN_ACCOUNT`), and never leaving the shop
   * without an active admin (409 `LAST_ADMIN`).
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    caller: AuthUser,
  ): Promise<AdminUserDto> {
    if (id === caller.id) {
      throw new BadRequestException({
        message: 'Ask another admin to change your own account',
        code: 'OWN_ACCOUNT',
      });
    }
    const user = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const target = await this.findOrFail(id, repository);
      const role = dto.role ?? target.role;
      const blocked = dto.blocked ?? target.blocked;
      const wasActiveAdmin = target.role === UserRole.Admin && !target.blocked;
      const staysActiveAdmin = role === UserRole.Admin && !blocked;
      if (wasActiveAdmin && !staysActiveAdmin) {
        await this.assertAnotherActiveAdmin(manager, id);
      }
      const endsSessions = role !== target.role || (blocked && !target.blocked);
      if (role === target.role && blocked === target.blocked) return target;
      await repository.update(id, { role, blocked });
      if (endsSessions) {
        await this.refreshTokens.revokeAllForUser(id, manager);
      }
      return Object.assign(target, { role, blocked });
    });
    return toAdminUserDto(user);
  }

  /** Emails a reset link, as "forgot password" does (nothing for a blocked account). */
  async sendPasswordReset(id: string): Promise<void> {
    const user = await this.findOrFail(id, this.users);
    this.auth.requestPasswordReset(user.email);
  }

  /**
   * Locks the active admins (a fixed order: no deadlock between two admins
   * demoting each other at once), then needs one besides `exceptId`.
   */
  private async assertAnotherActiveAdmin(
    manager: EntityManager,
    exceptId: string,
  ): Promise<void> {
    const admins = await manager.getRepository(User).find({
      select: { id: true },
      where: { role: UserRole.Admin, blocked: false },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!admins.some((admin) => admin.id !== exceptId)) {
      throw new ConflictException({
        message: 'This is the last active admin',
        code: 'LAST_ADMIN',
      });
    }
  }

  private async findOrFail(
    id: string,
    repository: Repository<User>,
  ): Promise<User> {
    const user = await repository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
