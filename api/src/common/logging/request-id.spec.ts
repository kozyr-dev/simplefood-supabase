import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { genReqId, isValidRequestId } from './request-id';
import { REQUEST_ID_HEADER } from './constants';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const req = (headers: IncomingHttpHeaders) => ({ headers }) as IncomingMessage;
const res = () =>
  ({ setHeader: jest.fn() }) as unknown as ServerResponse & {
    setHeader: jest.Mock;
  };

describe('isValidRequestId', () => {
  it.each([
    ['abc-123'],
    ['01a1559c-a1ed-7641-ac0e-64612b99bb5a'],
    ['0123456789abcdef0123456789abcdef'], // nginx $request_id
    ['a'.repeat(64)],
  ])('accepts %s', (value) => {
    expect(isValidRequestId(value)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
    ['space', 'abc 123'],
    ['duplicate headers joined by Node', 'aaa, bbb'],
    ['newline', 'abc\n123'],
    ['quotes and braces', 'x"}{"level":60'],
    ['underscore', 'abc_123'],
    ['undefined', undefined],
    ['number', 123],
    ['object', {}],
    ['array', ['abc']],
  ])('rejects %s', (_label, value) => {
    expect(isValidRequestId(value)).toBe(false);
  });
});

describe('genReqId', () => {
  it('generates a UUID when there is no incoming header', () => {
    const response = res();

    const id = genReqId(req({}), response);

    expect(id).toMatch(UUID);
    expect(response.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });

  it('reuses a valid incoming ID and echoes it back', () => {
    const response = res();

    const id = genReqId(req({ 'x-request-id': 'abc-123' }), response);

    expect(id).toBe('abc-123');
    expect(response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'abc-123',
    );
  });

  it('reuses an incoming UUID unchanged', () => {
    const incoming = '01a1559c-a1ed-7641-ac0e-64612b99bb5a';

    expect(genReqId(req({ 'x-request-id': incoming }), res())).toBe(incoming);
  });

  it('accepts an ID of exactly 64 characters', () => {
    const incoming = 'a'.repeat(64);

    expect(genReqId(req({ 'x-request-id': incoming }), res())).toBe(incoming);
  });

  it.each([
    ['65 characters', 'a'.repeat(65)],
    ['empty', ''],
    ['duplicate headers joined by Node', 'aaa, bbb'],
    ['a log injection attempt', 'x"}\n{"level":60,"msg":"fake"'],
    ['an array', ['abc', 'def']],
  ])('replaces %s with a new UUID', (_label, incoming) => {
    const response = res();

    const id = genReqId(req({ 'x-request-id': incoming }), response);

    expect(id).toMatch(UUID);
    expect(id).not.toBe(incoming);
    expect(response.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });

  it('generates a different ID for each request', () => {
    expect(genReqId(req({}), res())).not.toBe(genReqId(req({}), res()));
  });
});
