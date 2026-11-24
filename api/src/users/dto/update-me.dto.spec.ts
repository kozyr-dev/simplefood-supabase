import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMeDto } from './update-me.dto';

/** The properties that failed, as ValidationPipe would report them. */
async function invalid(body: object) {
  const errors = await validate(plainToInstance(UpdateMeDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

// The field rules themselves are UserFieldsDto's, tested through RegisterDto
// in auth.dto.spec.ts. Here: what being optional means for each field.
describe('UpdateMeDto', () => {
  it('accepts an empty body (nothing changes)', async () => {
    expect(await invalid({})).toEqual([]);
  });

  it('accepts any subset of the fields', async () => {
    expect(
      await invalid({
        name: 'Іван',
        phone: '+380 67 123 45 67',
        address: 'Kyiv, Khreshchatyk St, 1',
      }),
    ).toEqual([]);
    expect(
      await invalid({ email: 'new@example.com', currentPassword: 'secret' }),
    ).toEqual([]);
  });

  it('accepts null for phone and address: it clears them', async () => {
    expect(await invalid({ phone: null, address: null })).toEqual([]);
  });

  it('refuses null for name and email: they are required columns', async () => {
    expect(await invalid({ name: null, email: null })).toEqual([
      'name',
      'email',
    ]);
  });

  it('still applies the registration rules to the fields sent', async () => {
    expect(
      await invalid({ name: 'I', email: 'nope', phone: 'call me' }),
    ).toEqual(['name', 'email', 'phone']);
  });

  it.each([
    ['empty', ''],
    ['longer than 500 characters', 'x'.repeat(501)],
    ['not a string', 42],
  ])('refuses an address that is %s', async (_, address) => {
    expect(await invalid({ address })).toEqual(['address']);
  });

  it.each([
    ['empty', ''],
    ['longer than 256 characters', 'x'.repeat(257)],
  ])('refuses a currentPassword that is %s', async (_, currentPassword) => {
    expect(await invalid({ currentPassword })).toEqual(['currentPassword']);
  });

  it.each([
    ['role', { role: 'admin' }],
    ['blocked', { blocked: false }],
    ['passwordHash', { passwordHash: '$2b$04$x' }],
    ['id', { id: '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b' }],
  ])('refuses %s: not editable here', async (field, body) => {
    expect(await invalid(body)).toEqual([field]);
  });
});
