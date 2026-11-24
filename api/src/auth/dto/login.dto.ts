import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  /**
   * The account's email, in any letter case. Names aren't unique, so they
   * can't log in. Only checked for an `@` (as the database does), not as a
   * full address: an imported account with an odd one must still get in.
   * @example "ivan@example.com"
   */
  @IsString()
  @MaxLength(254)
  @Matches(/^[^@\s]+@\S+$/, { message: 'email must be an email address' })
  email: string;

  /**
   * No length rules here: accounts migrated from Strapi may have shorter
   * passwords. Capped only to bound the work per request.
   * @example "correct horse battery"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password: string;
}
