import { Media } from '../entities/media.entity';
import { toMediaDto, toMediaDtoOrNull } from './media.mapper';

function media(overrides: Partial<Media> = {}): Media {
  return Object.assign(new Media(), {
    id: '01a1559c-a1ed-7641-ac0e-64612b99bb5a',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-02T10:00:00Z'),
    url: '/uploads/borscht.jpg',
    mime: 'image/jpeg',
    size: 48213,
    width: 1000,
    height: 667,
    alt: 'Borscht with sour cream',
    folder: 'products',
    formats: {
      small: { url: '/uploads/small_borscht.jpg', width: 500, height: 333 },
    },
    ...overrides,
  });
}

describe('toMediaDto', () => {
  it('returns the public fields', () => {
    expect(toMediaDto(media())).toEqual({
      id: '01a1559c-a1ed-7641-ac0e-64612b99bb5a',
      url: '/uploads/borscht.jpg',
      alt: 'Borscht with sour cream',
      width: 1000,
      height: 667,
      formats: {
        small: { url: '/uploads/small_borscht.jpg', width: 500, height: 333 },
      },
    });
  });

  it('leaves internal columns out', () => {
    const dto = toMediaDto(media());

    for (const key of ['mime', 'size', 'folder', 'createdAt', 'updatedAt']) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('keeps nulls for files that are not images', () => {
    const dto = toMediaDto(
      media({
        mime: 'application/pdf',
        width: null,
        height: null,
        formats: null,
        alt: null,
      }),
    );

    expect(dto).toMatchObject({
      width: null,
      height: null,
      formats: null,
      alt: null,
    });
  });
});

describe('toMediaDtoOrNull', () => {
  it.each([null, undefined])('returns null for %p', (value) => {
    expect(toMediaDtoOrNull(value)).toBeNull();
  });

  it('maps a media entity', () => {
    expect(toMediaDtoOrNull(media())?.url).toBe('/uploads/borscht.jpg');
  });
});
