import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  /**
   * The account's email: the link goes to it.
   * @example "ivan@example.com"
   */
  @IsEmail()
  @MaxLength(254)
  email: string;
}
