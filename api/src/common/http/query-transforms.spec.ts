import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsOptional, validateSync } from 'class-validator';
import { ToBoolean } from './query-transforms';

class Query {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  flag?: boolean;
}

/** What the global ValidationPipe does with a query string. */
function parse(query: Record<string, string>) {
  const dto = plainToInstance(Query, query, {
    enableImplicitConversion: false,
  });
  return { flag: dto.flag, valid: validateSync(dto).length === 0 };
}

describe('ToBoolean', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('turns "%s" into %s', (input, expected) => {
    expect(parse({ flag: input })).toEqual({ flag: expected, valid: true });
  });

  it('leaves a missing value undefined', () => {
    expect(parse({})).toEqual({ flag: undefined, valid: true });
  });

  it.each(['yes', '1', 'TRUE', ''])(
    'passes "%s" through unchanged, so @IsBoolean rejects it',
    (input) => {
      expect(parse({ flag: input })).toEqual({ flag: input, valid: false });
    },
  );
});
