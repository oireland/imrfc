/** A Google Maps search for a free-text place, which opens the Maps app on phones. */
export function mapsSearchUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
