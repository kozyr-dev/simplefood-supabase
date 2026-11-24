import { Logger } from '@nestjs/common';
import {
  AbstractLogger,
  type LoggerOptions,
  type LogLevel,
  type LogMessage,
  type LogMessageType,
} from 'typeorm';

/**
 * TypeORM's own logs (failed and slow queries, migrations) through Nest's
 * logger: in the app that's pino, so they're JSON like every other line
 * instead of raw console output.
 *
 * Never with query parameters: they hold password hashes, emails, phone
 * numbers. The SQL text has only placeholders ($1, $2), and the driver's
 * error message names the constraint, not the values.
 */
export class TypeOrmLogger extends AbstractLogger {
  private readonly logger = new Logger('TypeORM');

  /**
   * `levels` can be a function, read on every call: the TypeORM CLI picks
   * the levels per command (`dataSource.setOptions({ logging })`) but keeps
   * a logger instance as it is, so the CLI data source passes
   * `() => dataSource.options.logging`.
   */
  constructor(
    private readonly levels: LoggerOptions | (() => LoggerOptions | undefined),
  ) {
    super(typeof levels === 'function' ? undefined : levels);
  }

  protected override isLogEnabledFor(
    type?: LogLevel | LogMessageType,
  ): boolean {
    if (typeof this.levels === 'function') {
      this.options = this.levels();
    }
    return super.isLogEnabledFor(type);
  }

  protected writeLog(
    level: LogLevel,
    logMessage: LogMessage | string | number | (LogMessage | string | number)[],
  ): void {
    const text = this.prepareLogMessages(logMessage, {
      appendParameterAsComment: false,
      highlightSql: false,
    })
      .map(({ prefix, message }) =>
        prefix ? `${prefix} ${String(message)}` : String(message),
      )
      .join(' ');

    // AbstractLogger reports failed and slow queries as 'warn'.
    switch (level) {
      case 'warn':
        this.logger.warn(text);
        break;
      case 'query':
        this.logger.debug(text);
        break;
      default:
        this.logger.log(text);
    }
  }
}
