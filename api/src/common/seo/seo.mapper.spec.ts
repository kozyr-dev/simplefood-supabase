import { Seo } from '@/database/entities/seo.embedded';
import { Media } from '@/media/entities/media.entity';
import { toSeoDto } from './seo.mapper';

const shareImage = Object.assign(new Media(), {
  id: 'media-1',
  url: '/uploads/og.jpg',
  mime: 'image/jpeg',
  size: 1000,
  width: 1200,
  height: 630,
  alt: 'SimpleFood',
  folder: null,
  formats: null,
});

describe('toSeoDto', () => {
  it('maps the title, description and share image', () => {
    const seo = Object.assign(new Seo(), {
      title: 'About us',
      description: 'Who we are',
      shareImage,
    });

    expect(toSeoDto(seo)).toEqual({
      title: 'About us',
      description: 'Who we are',
      shareImage: {
        id: 'media-1',
        url: '/uploads/og.jpg',
        alt: 'SimpleFood',
        width: 1200,
        height: 630,
        formats: null,
      },
    });
  });

  it.each([
    ['not loaded', undefined],
    ['removed', null],
  ])('returns shareImage: null when the image is %s', (_label, image) => {
    const seo = Object.assign(new Seo(), {
      title: 'T',
      description: null,
      shareImage: image,
    });

    expect(toSeoDto(seo).shareImage).toBeNull();
  });

  it.each([undefined, null])('returns all nulls for %p', (seo) => {
    expect(toSeoDto(seo)).toEqual({
      title: null,
      description: null,
      shareImage: null,
    });
  });
});
