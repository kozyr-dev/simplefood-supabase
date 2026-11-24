import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PassThrough, Readable } from 'node:stream';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, type Repository } from 'typeorm';
import { User, UserRole } from '@/users/entities/user.entity';
import {
  runCreateAdmin,
  type CommandContext,
  type CommandIo,
} from '@/users/cli/create-admin.command';
import type { TerminalInput } from '@/users/cli/read-password';
import { openUsersCliContext } from '@/users/cli/users-cli.module';
import { SAME_ORIGIN } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser } from './utils/factories';
import { createTestApp } from './utils/test-app';
import { resetRateLimits } from './utils/throttler';

const EMAIL = 'olena.admin@example.com';
const NAME = 'Olena Admin';
const PASSWORD = '  a long admin secret  ';

/** A fake terminal on stdin: `type()` sends keys once the prompt listens. */
function terminal() {
  const input = new PassThrough() as PassThrough & TerminalInput;
  input.isTTY = true;
  input.setRawMode = () => input;
  return input;
}

describe('npm run admin:create (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let users: Repository<User>;
  let out: string;
  let err: string;

  // The command closes its context when done; the test app stays open.
  const context = (): Promise<CommandContext> =>
    Promise.resolve({
      get: app.get.bind(app),
      close: () => Promise.resolve(),
    } as CommandContext);

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    resetRateLimits(app);
    out = '';
    err = '';
  });

  afterAll(async () => {
    await app.close();
  });

  function io(stdin: CommandIo['stdin']): CommandIo {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on('data', (chunk) => (out += String(chunk)));
    stderr.on('data', (chunk) => (err += String(chunk)));
    return { stdin, stdout, stderr };
  }

  /** Runs the command with the password piped in (`--password-stdin`). */
  const run = (argv: string[], password = `${PASSWORD}\n`) =>
    runCreateAdmin(
      [...argv, ...(argv.includes('--promote') ? [] : ['--password-stdin'])],
      io(Readable.from([password])),
      context,
    );

  const create = (extra: string[] = []) =>
    run(['--email', EMAIL, '--name', NAME, ...extra]);

  const findUser = () =>
    users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: EMAIL })
      .getOne();

  /** Nothing personal is ever printed. */
  const expectNothingPersonalPrinted = () => {
    for (const secret of [EMAIL, NAME, PASSWORD.trim()]) {
      expect(out + err).not.toContain(secret);
    }
  };

  // The other tests lend the command the test app; this one starts the
  // command's own module, with the test environment (this worker's database).
  it('runs with its own module, as `npm run admin:create` does', async () => {
    const code = await runCreateAdmin(
      ['--email', EMAIL, '--name', NAME, '--password-stdin'],
      io(Readable.from([`${PASSWORD}\n`])),
      openUsersCliContext,
    );

    expect({ code, out, err }).toEqual({
      code: 0,
      out: 'Created the admin account.\n',
      err: '',
    });
    expect((await findUser())?.role).toBe(UserRole.Admin);
  });

  describe('creating an account', () => {
    it('creates a verified admin that can log in to the admin app', async () => {
      expect(await create()).toBe(0);

      expect(out).toBe('Created the admin account.\n');
      expect(err).toBe('');
      const user = await findUser();
      expect(user).toMatchObject({
        name: NAME,
        role: UserRole.Admin,
        blocked: false,
        emailVerifiedAt: expect.any(Date),
      });
      // The password exactly as given (spaces kept, the line break dropped).
      expect(await bcrypt.compare(PASSWORD, user?.passwordHash ?? '')).toBe(
        true,
      );
      await request(app.getHttpServer())
        .post('/api/admin/auth/login')
        .set(SAME_ORIGIN)
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);
      expectNothingPersonalPrinted();
    });

    it('creates an editor with --role editor', async () => {
      expect(await create(['--role', 'editor'])).toBe(0);

      expect(out).toBe('Created the editor account.\n');
      expect((await findUser())?.role).toBe(UserRole.Editor);
    });

    it('trims the email and name, like every request body', async () => {
      expect(await run(['--email', ` ${EMAIL} `, '--name', ` ${NAME} `])).toBe(
        0,
      );

      expect(await findUser()).toMatchObject({ name: NAME });
    });

    it('asks for the password twice on a terminal, showing nothing', async () => {
      const stdin = terminal();
      const done = runCreateAdmin(
        ['--email', EMAIL, '--name', NAME],
        io(stdin),
        context,
      );
      stdin.write(`${PASSWORD}\r`);
      stdin.write(`${PASSWORD}\r`);

      expect(await done).toBe(0);
      expect(err).toBe('Password: \nRepeat the password: \n');
      expect(await findUser()).not.toBeNull();
      expectNothingPersonalPrinted();
    });

    it('refuses passwords that differ, and creates nothing', async () => {
      const stdin = terminal();
      const done = runCreateAdmin(
        ['--email', EMAIL, '--name', NAME],
        io(stdin),
        context,
      );
      stdin.write(`${PASSWORD}\r`);
      stdin.write('another password\r');

      expect(await done).toBe(1);
      expect(err).toContain('The passwords do not match\n');
      expect(await users.count()).toBe(0);
    });

    it('refuses an email in use (in any letter case)', async () => {
      await createUser(dataSource, { email: EMAIL.toUpperCase() });

      expect(await create()).toBe(1);

      expect(err).toBe('Refused: An account with this email already exists.\n');
      expect(await users.count()).toBe(1);
    });

    it("takes a name another account has: names aren't unique", async () => {
      await createUser(dataSource, { name: NAME });

      expect(await create()).toBe(0);

      expect(await users.count()).toBe(2);
    });

    it.each([
      [
        'an invalid email',
        ['--email', 'not-an-email', '--name', NAME],
        'email must be an email',
      ],
      [
        'a name with a control character',
        ['--email', EMAIL, '--name', 'Olena\u0007'],
        'name must not contain control characters',
      ],
      [
        'a one-letter name',
        ['--email', EMAIL, '--name', 'A'],
        'name must be longer than or equal to 2 characters',
      ],
    ])('refuses %s', async (_, argv, message) => {
      expect(await run(argv)).toBe(1);

      expect(err).toContain(message);
      expect(await users.count()).toBe(0);
    });

    it.each([
      ['shorter than 8 characters', 'short12', 'at least 8 characters'],
      ['over 72 bytes', 'й'.repeat(37), 'at most 72 bytes'],
    ])('refuses a password %s', async (_, password, message) => {
      expect(await run(['--email', EMAIL, '--name', NAME], password)).toBe(1);

      expect(err).toContain(message);
      expect(await users.count()).toBe(0);
    });
  });

  describe('--promote', () => {
    it.each([
      ['admin', [], 'The account is now an admin.\n'],
      ['editor', ['--role', 'editor'], 'The account is now an editor.\n'],
    ])(
      'makes a customer %s, keeping the password',
      async (role, extra, message) => {
        const customer = await createUser(dataSource, { email: EMAIL });

        expect(await run(['--promote', EMAIL, ...extra])).toBe(0);

        expect(out).toBe(message);
        const user = await users.findOneByOrFail({ id: customer.id });
        expect(user.role).toBe(role);
        // Only the role: verification is still the owner's to prove.
        expect(user.emailVerifiedAt).toBeNull();
        expectNothingPersonalPrinted();
      },
    );

    it('finds the email in any letter case', async () => {
      await createUser(dataSource, { email: EMAIL });

      expect(await run(['--promote', EMAIL.toUpperCase()])).toBe(0);
    });

    it('changes nothing for an account that has the role already', async () => {
      await createUser(dataSource, { email: EMAIL, role: UserRole.Admin });

      expect(await run(['--promote', EMAIL])).toBe(0);

      expect(out).toBe('The account is already an admin; nothing changed.\n');
    });

    it('refuses an unknown email', async () => {
      expect(await run(['--promote', EMAIL])).toBe(1);

      expect(err).toBe('Refused: No account has this email.\n');
    });

    it('refuses a blocked account', async () => {
      const blocked = await createUser(dataSource, {
        email: EMAIL,
        blocked: true,
      });

      expect(await run(['--promote', EMAIL])).toBe(1);

      expect(err).toBe('Refused: This account is blocked.\n');
      expect((await users.findOneByOrFail({ id: blocked.id })).role).toBe(
        UserRole.Customer,
      );
    });
  });
});
