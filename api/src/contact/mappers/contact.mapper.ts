import type { AdminContactMessageDto } from '../dto/admin-contact-message.dto';
import type { ContactSubmission } from '../entities/contact-submission.entity';

export function toAdminContactMessageDto(
  message: ContactSubmission,
): AdminContactMessageDto {
  return {
    id: message.id,
    name: message.name,
    email: message.email,
    message: message.message,
    handled: message.handledAt !== null,
    handledAt: message.handledAt,
    createdAt: message.createdAt,
  };
}
