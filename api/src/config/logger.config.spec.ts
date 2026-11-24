import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import type { Options } from 'pino-http';
import pino from 'pino';
import { genReqId } from '@/common/logging/request-id';
import loggerConfig, {
  isApiDocsRequest,
  isHealthCheck,
  isUnloggedRequest,
  REDACTED_PATHS,
  requestLogLevel,
} from './logger.config';

/** Runs the config factory with the given env, then restores the env. */
function buildWith(env: { NODE_ENV?: string; LOG_LEVEL?: string }): Options {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return loggerConfig().pinoHttp as Options;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('logger config', () => {
  describe('level', () => {
    it.each([
      ['test', 'silent'],
      ['development', 'debug'],
      ['production', 'info'],
    ])(
      'defaults to the NODE_ENV=%s level (%s) when LOG_LEVEL is unset',
      (nodeEnv, level) => {
        expect(
          buildWith({ NODE_ENV: nodeEnv, LOG_LEVEL: undefined }).level,
        ).toBe(level);
      },
    );

    it('lets LOG_LEVEL override the default', () => {
      expect(
        buildWith({ NODE_ENV: 'production', LOG_LEVEL: 'debug' }).level,
      ).toBe('debug');
    });
  });

  describe('transport', () => {
    it('uses pino-pretty in development', () => {
      expect(buildWith({ NODE_ENV: 'development' }).transport).toMatchObject({
        target: 'pino-pretty',
      });
    });

    // pino-pretty is a devDependency: selecting it in production would crash
    // the app on start, because `npm ci --omit=dev` doesn't install it.
    it.each(['production', 'test'])('writes plain JSON in %s', (nodeEnv) => {
      expect(buildWith({ NODE_ENV: nodeEnv }).transport).toBeUndefined();
    });
  });

  it('uses safe request IDs and binds only the ID to request-scoped logs', () => {
    const options = buildWith({ NODE_ENV: 'production' });

    expect(options.genReqId).toBe(genReqId);
    expect(options.quietReqLogger).toBe(true);
  });

  it('redacts credentials from request and response headers', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const logger = pino(
      { redact: buildWith({ NODE_ENV: 'production' }).redact },
      sink,
    );

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer eyJhbGciOi.secret-token',
          cookie: 'refresh_token=secret-cookie',
          'user-agent': 'curl/8',
        },
      },
      res: { headers: { 'set-cookie': 'session=secret-set-cookie' } },
    });

    const output = lines.join('');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('secret-cookie');
    expect(output).not.toContain('secret-set-cookie');
    expect(output).toContain('[Redacted]');
    expect(output).toContain('curl/8'); // harmless headers are kept
    expect(REDACTED_PATHS).toHaveLength(3);
  });

  describe('requestLogLevel', () => {
    const req = {} as IncomingMessage;
    const res = (statusCode: number) => ({ statusCode }) as ServerResponse;

    it.each([
      [200, 'info'],
      [201, 'info'],
      [304, 'info'],
      [400, 'warn'],
      [404, 'warn'],
      [500, 'error'],
      [503, 'error'],
    ])('logs a %i response at %s', (status, level) => {
      expect(requestLogLevel(req, res(status))).toBe(level);
    });

    it('logs at error when the request failed with an error', () => {
      expect(requestLogLevel(req, res(200), new Error('aborted'))).toBe(
        'error',
      );
    });
  });

  describe('isHealthCheck', () => {
    const req = (method: string, url: string) =>
      ({ method, url }) as IncomingMessage;

    it('matches GET /health, with or without a query string', () => {
      expect(isHealthCheck(req('GET', '/health'))).toBe(true);
      expect(isHealthCheck(req('GET', '/health?probe=docker'))).toBe(true);
    });

    it('does not match other routes or methods', () => {
      expect(isHealthCheck(req('GET', '/api/health'))).toBe(false);
      expect(isHealthCheck(req('GET', '/healthz'))).toBe(false);
      expect(isHealthCheck(req('POST', '/health'))).toBe(false);
    });
  });

  describe('isApiDocsRequest', () => {
    const req = (method: string, url: string) =>
      ({ method, url }) as IncomingMessage;

    it.each([
      '/api/docs',
      '/api/docs-json',
      '/api/docs/swagger-ui-bundle.js',
      '/api/docs/swagger-ui.css?v=1',
    ])('matches GET %s', (url) => {
      expect(isApiDocsRequest(req('GET', url))).toBe(true);
    });

    it.each(['/api/docsearch', '/api/docs-yaml', '/api', '/docs'])(
      'does not match GET %s',
      (url) => {
        expect(isApiDocsRequest(req('GET', url))).toBe(false);
      },
    );

    it('does not match other methods', () => {
      expect(isApiDocsRequest(req('POST', '/api/docs'))).toBe(false);
    });
  });

  describe('isUnloggedRequest', () => {
    const req = (url: string) => ({ method: 'GET', url }) as IncomingMessage;

    it('skips health probes and the API docs, logs everything else', () => {
      expect(isUnloggedRequest(req('/health'))).toBe(true);
      expect(isUnloggedRequest(req('/api/docs/swagger-ui-init.js'))).toBe(true);
      expect(isUnloggedRequest(req('/api/orders'))).toBe(false);
    });

    it('is what the logger config uses', () => {
      const options = loggerConfig().pinoHttp as Options;
      expect(options.autoLogging).toEqual({ ignore: isUnloggedRequest });
    });
  });
});
