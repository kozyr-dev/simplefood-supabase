import { parseArgs } from 'node:util';
import type { Readable, Writable } from 'node:stream';
import type { INestApplicationContext } from '@nestjs/common';
import { UserRole } from '../entities/user.entity';
import { PasswordService } from '../services/password.service';
import { UsersService } from '../services/users.service';
import {
  promptHidden,
  readPasswordFrom,
  type TerminalInput,
} from './read-password';
import {
  createStaffAccount,
  setStaffRole,
  StaffAccountError,
  type StaffRole,
} from './staff-accounts';

export const USAGE = `Creates a staff account for the admin app, or gives an existing account a staff role.

  npm run admin:create -- --email <email> --name <name> [--role admin|editor] [--password-stdin]
  npm run admin:create -- --promote <email> [--role admin|editor]

The role is admin unless --role says editor. The password is asked for twice
without being shown; with --password-stdin it is read from a pipe instead.
It is never taken from the command line or the environment.`;

/** Where the command reads and writes; the real process, or a test's streams. */
export interface CommandIo {
  /** A terminal (prompts) or a pipe (`--password-stdin`). */
  stdin: Readable & { isTTY?: boolean; setRawMode?(mode: boolean): unknown };
  stdout: Writable;
  stderr: Writable;
}

/** What the command needs from Nest: services, and closing at the end. */
export type CommandContext = Pick<INestApplicationContext, 'get' | 'close'>;

const STAFF_ROLES: readonly string[] = [UserRole.Admin, UserRole.Editor];

/**
 * Runs `admin:create` and returns the exit code: 0 done (or nothing to
 * change), 1 refused or failed, 2 wrong usage. Never prints the email,
 * the name or the password. The application context (the database) is
 * opened only once the arguments and the password are in.
 */
export async function runCreateAdmin(
  argv: string[],
  io: CommandIo,
  openContext: () => Promise<CommandContext>,
): Promise<number> {
  const usage = (problem: string) => {
    io.stderr.write(`${problem}\n\n${USAGE}\n`);
    return 2;
  };

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        promote: { type: 'string' },
        role: { type: 'string', default: UserRole.Admin },
        'password-stdin': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    return usage((error as Error).message);
  }
  if (values.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!STAFF_ROLES.includes(values.role)) {
    return usage('--role must be admin or editor');
  }
  const role = values.role as StaffRole;
  const promoting = values.promote !== undefined;
  if (promoting && (values.email || values.name)) {
    return usage('--promote takes no --email or --name');
  }
  if (promoting && values['password-stdin']) {
    return usage('--promote keeps the password: no --password-stdin');
  }
  if (!promoting && (!values.email || !values.name)) {
    return usage('Give --email and --name, or --promote');
  }

  let password = '';
  if (!promoting) {
    try {
      password = await readPassword(io, values['password-stdin']);
    } catch (error) {
      io.stderr.write(`${(error as Error).message}\n`);
      return 1;
    }
  }

  let context: CommandContext | undefined;
  try {
    context = await openContext();
    const users = context.get(UsersService);
    if (promoting) {
      const changed = await setStaffRole(
        { users },
        values.promote as string,
        role,
      );
      io.stdout.write(
        changed
          ? `The account is now ${articled(role)}.\n`
          : `The account is already ${articled(role)}; nothing changed.\n`,
      );
    } else {
      await createStaffAccount(
        { users, passwords: context.get(PasswordService) },
        {
          name: values.name as string,
          email: values.email as string,
          password,
          role,
        },
      );
      io.stdout.write(`Created the ${role} account.\n`);
    }
    return 0;
  } catch (error) {
    io.stderr.write(
      error instanceof StaffAccountError
        ? `Refused: ${error.message}.\n`
        : `Failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  } finally {
    await context?.close();
  }
}

/** From the pipe, or asked twice on the terminal. */
async function readPassword(
  { stdin, stderr }: CommandIo,
  fromStdin: boolean,
): Promise<string> {
  if (fromStdin) {
    const password = await readPasswordFrom(stdin);
    if (!password) {
      throw new Error('No password on standard input');
    }
    return password;
  }
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error(
      'No terminal to ask for the password on: pipe it in with --password-stdin',
    );
  }
  const terminal = stdin as TerminalInput;
  // On stderr, like other prompts: stdout stays the command's result.
  const first = await promptHidden('Password: ', terminal, stderr);
  const second = await promptHidden('Repeat the password: ', terminal, stderr);
  if (first !== second) {
    throw new Error('The passwords do not match');
  }
  return first;
}

const articled = (role: StaffRole) =>
  role === UserRole.Admin ? 'an admin' : 'an editor';
