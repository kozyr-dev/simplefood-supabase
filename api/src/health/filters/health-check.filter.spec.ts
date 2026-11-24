import { ArgumentsHost, ServiceUnavailableException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  HEALTH_FAILURE_MESSAGE,
  HealthCheckFilter,
  redactHealthMessages,
} from './health-check.filter';

// What Terminus throws when the database ping fails (shape from @nestjs/terminus).
const failedCheck = () => ({
  status: 'error',
  info: { memory: { status: 'up' } },
  error: {
    database: {
      status: 'down',
      message: 'password authentication failed for user "simplefood"',
      responseTime: 3,
    },
  },
  details: {
    memory: { status: 'up' },
    database: {
      status: 'down',
      message: 'password authentication failed for user "simplefood"',
      responseTime: 3,
    },
  },
});

describe('redactHealthMessages', () => {
  it('replaces the raw error of failed indicators, in `error` and `details`', () => {
    const body = redactHealthMessages(failedCheck()) as ReturnType<
      typeof failedCheck
    >;

    expect(body.error.database.message).toBe(HEALTH_FAILURE_MESSAGE);
    expect(body.details.database.message).toBe(HEALTH_FAILURE_MESSAGE);
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it("keeps Terminus' format: status, healthy indicators and other fields", () => {
    const body = redactHealthMessages(failedCheck());

    expect(body).toEqual({
      status: 'error',
      info: { memory: { status: 'up' } },
      error: {
        database: {
          status: 'down',
          message: HEALTH_FAILURE_MESSAGE,
          responseTime: 3,
        },
      },
      details: {
        memory: { status: 'up' },
        database: {
          status: 'down',
          message: HEALTH_FAILURE_MESSAGE,
          responseTime: 3,
        },
      },
    });
  });

  it('does not mutate the original body', () => {
    const original = failedCheck();
    redactHealthMessages(original);

    expect(original.error.database.message).toContain('password');
  });

  it.each([undefined, null, 'Service Unavailable'])(
    'passes through a non-object body (%p)',
    (body) => {
      expect(redactHealthMessages(body)).toBe(body);
    },
  );
});

describe('HealthCheckFilter', () => {
  it('replies 503 with the redacted body', () => {
    const reply = jest.fn();
    const response = {};
    const filter = new HealthCheckFilter({
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    filter.catch(new ServiceUnavailableException(failedCheck()), host);

    const [sentTo, body, status] = reply.mock.calls[0] as [
      unknown,
      unknown,
      number,
    ];
    expect(sentTo).toBe(response);
    expect(status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
