import { ValidationError } from 'class-validator';
import { flattenValidationErrors } from './flatten-validation-errors';

/** Builds a ValidationError node the way class-validator does. */
function node(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return Object.assign(new ValidationError(), {
    property,
    constraints,
    children,
  });
}

describe('flattenValidationErrors', () => {
  it('returns an empty list for no errors', () => {
    expect(flattenValidationErrors([])).toEqual({
      details: [],
      truncated: false,
    });
  });

  it('reports top-level fields with all their messages', () => {
    const result = flattenValidationErrors([
      node('email', { isEmail: 'email must be an email' }),
      node('quantity', {
        isInt: 'quantity must be an integer number',
        min: 'quantity must not be less than 1',
      }),
    ]);

    expect(result.details).toEqual([
      { field: 'email', messages: ['email must be an email'] },
      {
        field: 'quantity',
        messages: [
          'quantity must be an integer number',
          'quantity must not be less than 1',
        ],
      },
    ]);
  });

  it('uses dotted paths for nested objects', () => {
    const result = flattenValidationErrors([
      node('address', undefined, [
        node('city', { isNotEmpty: 'city should not be empty' }),
      ]),
    ]);

    expect(result.details).toEqual([
      { field: 'address.city', messages: ['city should not be empty'] },
    ]);
  });

  it('uses the array index in paths for array items', () => {
    const result = flattenValidationErrors([
      node('items', undefined, [
        node('0', undefined, [
          node('quantity', { min: 'quantity must not be less than 1' }),
        ]),
        node('2', undefined, [
          node('name', { isString: 'name must be a string' }),
        ]),
      ]),
    ]);

    expect(result.details.map((detail) => detail.field)).toEqual([
      'items.0.quantity',
      'items.2.name',
    ]);
  });

  it('reports a node that has both its own constraints and children', () => {
    const result = flattenValidationErrors([
      node(
        'items',
        { arrayMaxSize: 'items must contain no more than 2 elements' },
        [
          node('0', undefined, [
            node('name', { isString: 'name must be a string' }),
          ]),
        ],
      ),
    ]);

    expect(result.details.map((detail) => detail.field)).toEqual([
      'items',
      'items.0.name',
    ]);
  });

  it('stops at the limit and flags the result as truncated', () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      node(String(index), { isString: 'must be a string' }),
    );

    const result = flattenValidationErrors([node('items', undefined, many)], 3);

    expect(result.details).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when the count equals the limit', () => {
    const result = flattenValidationErrors(
      [node('a', { x: 'a' }), node('b', { x: 'b' })],
      2,
    );

    expect(result.truncated).toBe(false);
  });
});
