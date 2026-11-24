import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  Not,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { adminOrder, contains } from '@/common/admin/admin-list';
import { paginate, toSkipTake, type Paginated } from '@/common/http/responses';
import type {
  AdminContactMessageDto,
  AdminContactMessagesQueryDto,
  UpdateContactMessageDto,
} from '../dto/admin-contact-message.dto';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { toAdminContactMessageDto } from '../mappers/contact.mapper';

@Injectable()
export class AdminContactMessagesService {
  constructor(
    @InjectRepository(ContactSubmission)
    private readonly messages: Repository<ContactSubmission>,
  ) {}

  /** `q`: part of the name, email or message. */
  async findAll(
    query: AdminContactMessagesQueryDto,
  ): Promise<Paginated<AdminContactMessageDto>> {
    const base: FindOptionsWhere<ContactSubmission> = {};
    if (query.id) base.id = In(query.id);
    if (query.handled !== undefined) {
      base.handledAt = query.handled ? Not(IsNull()) : IsNull();
    }
    const where = query.q
      ? (['name', 'email', 'message'] as const).map((field) => ({
          ...base,
          [field]: contains(query.q as string),
        }))
      : [base];
    const [rows, total] = await this.messages.findAndCount({
      where,
      order: adminOrder(query.sort, query.order),
      ...toSkipTake(query),
    });
    return paginate(rows.map(toAdminContactMessageDto), total, query);
  }

  async findOne(id: string): Promise<AdminContactMessageDto> {
    return toAdminContactMessageDto(await this.findOrFail(id));
  }

  /** Marks it handled (keeping the first time it was) or new again. */
  async update(
    id: string,
    { handled }: UpdateContactMessageDto,
  ): Promise<AdminContactMessageDto> {
    const message = await this.findOrFail(id);
    if (handled !== (message.handledAt !== null)) {
      message.handledAt = handled ? new Date() : null;
      await this.messages.save(message);
    }
    return toAdminContactMessageDto(message);
  }

  async remove(id: string): Promise<void> {
    const { affected } = await this.messages.delete(id);
    if (!affected) throw notFound();
  }

  private async findOrFail(id: string): Promise<ContactSubmission> {
    const message = await this.messages.findOneBy({ id });
    if (!message) throw notFound();
    return message;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException('Message not found');
}
