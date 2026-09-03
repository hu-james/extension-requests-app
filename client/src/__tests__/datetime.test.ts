import { describe, expect, it } from 'vitest';
import {
  localDateTimeToUtcIso,
  toDateTimeLocalString,
} from '../utils/datetime';

describe('datetime conversion', () => {
  it('converts a browser-local datetime to an absolute UTC instant', () => {
    const localValue = '2026-09-04T23:59';
    const expected = new Date(2026, 8, 4, 23, 59).toISOString();

    expect(localDateTimeToUtcIso(localValue)).toBe(expected);
  });

  it('round-trips an absolute timestamp through datetime-local format', () => {
    const absoluteValue = '2026-09-05T04:59:00.000Z';
    const localValue = toDateTimeLocalString(absoluteValue);

    expect(localDateTimeToUtcIso(localValue)).toBe(absoluteValue);
  });

  it('rejects an invalid local datetime', () => {
    expect(() => localDateTimeToUtcIso('not-a-date')).toThrow(
      'Invalid local date and time'
    );
  });
});
