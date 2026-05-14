/**
 * Tests for overpass/filterTags.ts.
 */
import { describe, it, expect } from 'vitest';
import { filterTags } from './filterTags.js';

const WHITELIST = new Set(['building', 'height', 'name']);

describe('filterTags', () => {
  it('returns only whitelisted keys', () => {
    const tags = { building: 'yes', height: '12', amenity: 'cafe', name: 'HQ' };
    const result = filterTags(tags, WHITELIST);
    expect(result).toEqual({ building: 'yes', height: '12', name: 'HQ' });
    expect('amenity' in result).toBe(false);
  });

  it('returns empty object when no keys match whitelist', () => {
    const tags = { amenity: 'cafe', addr_street: 'Main St' };
    expect(filterTags(tags, WHITELIST)).toEqual({});
  });

  it('returns empty object for undefined tags', () => {
    expect(filterTags(undefined, WHITELIST)).toEqual({});
  });

  it('returns empty object for empty tags', () => {
    expect(filterTags({}, WHITELIST)).toEqual({});
  });

  it('returns all tags when all keys are whitelisted', () => {
    const tags = { building: 'yes', height: '5', name: 'Tower' };
    expect(filterTags(tags, WHITELIST)).toEqual(tags);
  });

  it('does not mutate the original tags object', () => {
    const tags = { building: 'yes', secret: 'value' };
    filterTags(tags, WHITELIST);
    expect('secret' in tags).toBe(true);
  });
});
