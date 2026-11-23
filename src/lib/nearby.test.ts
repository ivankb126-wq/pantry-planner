import { describe, expect, it } from 'vitest';
import { byDistance, distanceKm, formatDistance, roughPlace, uniqueStores } from './nearby';

const store = (id: string, address: string, lat?: number, lon?: number) => ({ id, type: '', address, city: 'Osijek', zip: '', lat, lon });

describe('stores near me', () => {
  it('measures distance', () => {
    // Osijek to Zagreb is about 210 km as the crow flies
    expect(Math.round(distanceKm({ lat: 45.555, lon: 18.695 }, { lat: 45.813, lon: 15.977 }))).toBeGreaterThan(200);
    expect(distanceKm({ lat: 45.5, lon: 18.7 }, { lat: 45.5, lon: 18.7 })).toBe(0);
  });
  it('writes distances simply', () => {
    expect(formatDistance(0.43)).toBe('450 m');
    expect(formatDistance(2.34)).toBe('2,3 km');
    expect(formatDistance(35.4)).toBe('35 km');
  });
  it('puts the nearest first and stores without a position last', () => {
    const home = { lat: 45.555, lon: 18.695 };
    const out = byDistance([store('far', 'A 1', 45.6, 18.8), store('none', 'B 2'), store('near', 'C 3', 45.556, 18.696)], home);
    expect(out.map((s) => s.id)).toEqual(['near', 'far', 'none']);
    expect(out[2].km).toBeNull();
  });
  it('drops a store listed twice', () => {
    expect(uniqueStores([store('1', 'Ulica 3. Gardijske Brigade Kune 2'), store('2', 'Ulica 3.Gardijske Brigade Kune 2')]).map((s) => s.id)).toEqual(['1']);
  });
  it('keeps only a rough position', () => {
    expect(roughPlace(45.55512, 18.69541)).toEqual({ lat: 45.555, lon: 18.695 });
  });
});
