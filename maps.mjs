export function mapSearchLinks(query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) {
    throw new RangeError('Enter a place or address within 200 characters');
  }
  const google = new URL('https://www.google.com/maps/search/');
  google.searchParams.set('api', '1');
  google.searchParams.set('query', query.trim());
  const apple = new URL('https://maps.apple.com/search');
  apple.searchParams.set('query', query.trim());
  return { google: google.href, apple: apple.href };
}
