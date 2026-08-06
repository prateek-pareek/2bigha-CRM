import {
  resolvePublicMediaUrl,
  resolvePublicMediaUrlsInHtml,
} from './media-url.util';

describe('resolvePublicMediaUrl', () => {
  const prev = process.env.PUBLIC_API_URL;

  beforeEach(() => {
    process.env.PUBLIC_API_URL = 'https://apps.mathionix.tech';
  });

  afterEach(() => {
    process.env.PUBLIC_API_URL = prev;
  });

  it('absolutizes relative upload paths', () => {
    expect(resolvePublicMediaUrl('/uploads/photo.jpg')).toBe(
      'https://apps.mathionix.tech/uploads/photo.jpg',
    );
  });

  it('leaves Cloudinary URLs unchanged', () => {
    const url =
      'https://res.cloudinary.com/demo/image/upload/v1/mathionix/social/photo.jpg';
    expect(resolvePublicMediaUrl(url)).toBe(url);
  });
});

describe('resolvePublicMediaUrlsInHtml', () => {
  const prev = process.env.PUBLIC_API_URL;

  beforeEach(() => {
    process.env.PUBLIC_API_URL = 'https://apps.mathionix.tech';
  });

  afterEach(() => {
    process.env.PUBLIC_API_URL = prev;
  });

  it('rewrites img src attributes in blog HTML', () => {
    const html =
      '<p>Hello</p><img src="/uploads/inline.jpg" alt="Diagram" data-float="center" />';
    expect(resolvePublicMediaUrlsInHtml(html)).toBe(
      '<p>Hello</p><img src="https://apps.mathionix.tech/uploads/inline.jpg" alt="Diagram" data-float="center" />',
    );
  });
});
