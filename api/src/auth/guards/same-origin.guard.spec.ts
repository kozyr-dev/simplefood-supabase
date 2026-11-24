import type { IncomingMessage } from 'node:http';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { isSameOrigin, SameOriginGuard } from './same-origin.guard';

function canActivate(
  method: string,
  headers: IncomingMessage['headers'],
): boolean {
  const request = { method, headers } as IncomingMessage;
  return new SameOriginGuard().canActivate(
    new ExecutionContextHost([request, {}]),
  );
}

describe('isSameOrigin', () => {
  it.each([
    ['https://api.example.com', 'api.example.com'],
    ['http://localhost:1339', 'localhost:1339'],
    // The Vite dev server passes /api through, keeping its own Host.
    ['http://localhost:5173', 'localhost:5173'],
    ['https://api.example.com', 'api.example.com:443'],
    ['http://api.example.com', 'API.example.com'],
    ['http://[::1]:1339', '[::1]:1339'],
  ])('accepts Origin %s for Host %s', (origin, host) => {
    expect(isSameOrigin(origin, host)).toBe(true);
  });

  it.each([
    ['another site', 'https://evil.example', 'api.example.com'],
    ['a sibling subdomain', 'https://shop.example.com', 'api.example.com'],
    ['a parent domain', 'https://example.com', 'api.example.com'],
    ['a lookalike suffix', 'https://api.example.com.evil', 'api.example.com'],
    ['another port', 'http://localhost:3000', 'localhost:1339'],
    [
      'an explicit non-default port',
      'https://api.example.com:8443',
      'api.example.com',
    ],
    ['Origin: null', 'null', 'api.example.com'],
    ['a non-web scheme', 'file://api.example.com', 'api.example.com'],
    ['no Origin', undefined, 'api.example.com'],
    ['no Host', 'https://api.example.com', undefined],
    ['garbage', 'not a url', 'api.example.com'],
    [
      'a Host with a path in it',
      'https://api.example.com',
      'api.example.com/x',
    ],
    [
      'a Host with a user in it',
      'https://api.example.com',
      'me@api.example.com',
    ],
  ])('refuses %s', (_, origin, host) => {
    expect(isSameOrigin(origin, host)).toBe(false);
  });
});

describe('SameOriginGuard', () => {
  it('lets a same-origin POST through', () => {
    expect(
      canActivate('POST', {
        origin: 'https://api.example.com',
        host: 'api.example.com',
      }),
    ).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through without an Origin (it changes nothing)',
    (method) => {
      expect(canActivate(method, { host: 'api.example.com' })).toBe(true);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses a %s from another origin, or without one, with 403 CROSS_ORIGIN_REQUEST',
    (method) => {
      for (const origin of ['https://evil.example', undefined]) {
        let error: unknown;
        try {
          canActivate(method, { origin, host: 'api.example.com' });
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          message: 'Requests from other sites are not allowed here',
          code: 'CROSS_ORIGIN_REQUEST',
        });
      }
    },
  );
});
