import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_PAGE_SIZE, PaginationQueryDto } from './pagination-query.dto';

/** What the global ValidationPipe does with a query string. */
function parse(query: Record<string, string>) {
  const dto = plainToInstance(PaginationQueryDto, query, {
    enableImplicitConversion: false,
  });
  const failed = validateSync(dto, { whitelist: true }).map(
    (error) => error.property,
  );
  return { dto, failed };
}

describe('PaginationQueryDto', () => {
  it('defaults to page 1 with 20 items', () => {
    expect(parse({})).toEqual({
      dto: { page: 1, pageSize: 20 },
      failed: [],
    });
  });

  it('turns the query strings into numbers', () => {
    expect(parse({ page: '3', pageSize: '50' }).dto).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it(`accepts pageSize up to ${MAX_PAGE_SIZE}`, () => {
    expect(parse({ pageSize: String(MAX_PAGE_SIZE) }).failed).toEqual([]);
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['pageSize', '0'],
    ['pageSize', String(MAX_PAGE_SIZE + 1)],
    ['pageSize', 'all'],
  ])('rejects %s=%s', (key, value) => {
    expect(parse({ [key]: value }).failed).toEqual([key]);
  });
});
