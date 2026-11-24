import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** A phone number as people type it; shared with checkout (orders). */
export const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
export const PHONE_MESSAGE =
  '$property must be 7-20 digits, spaces, "-", "(", ")", optionally after "+"';

/*
 * The editable account fields and their rules, in one place: registration
 * picks some (auth's RegisterDto), PATCH /users/me takes them all as
 * optional (UpdateMeDto). Never a request body itself.
 *
 * The entity's CHECK constraints repeat the name and email rules for
 * writers that skip the DTOs (the data migration, the admin CLI).
 */
export class UserFieldsDto {
  /**
   * The person's name, shown in the UI and offered at checkout. Any script;
   * not unique. At most 100 characters, like an order's name.
   * @example "Ivan Petrenko"
   */
  @IsString()
  @Length(2, 100)
  @Matches(/^[^\p{Cc}]+$/u, {
    message: 'name must not contain control characters',
  })
  name: string;

  /**
   * Unique, in any letter case; the account's login.
   * @example "ivan@example.com"
   */
  @IsEmail()
  @MaxLength(254)
  email: string;

  /**
   * Contact phone, optional: `null` for none.
   * @example "+380 67 123 45 67"
   */
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string | null;

  /**
   * Delivery address, optional: `null` for none.
   * @example "Kyiv, Khreshchatyk St, 1, apt. 5"
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string | null;
}
