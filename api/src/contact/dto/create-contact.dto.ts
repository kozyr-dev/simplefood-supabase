import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const MAX_MESSAGE_LENGTH = 5000;

/** POST /contact: a message for the shop. */
export class CreateContactDto {
  /** @example "Olena" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /**
   * Where the shop replies.
   * @example "olena@example.com"
   */
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** @example "Do you deliver to Irpin?" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  message: string;

  /**
   * Leave empty. A field the form hides from people, so only bots fill it
   * in: such a message is dropped, with the same 204.
   * @example ""
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
