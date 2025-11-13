import { type DetectedObject } from '../types/detection';

type NumericLike = number | string | null | undefined;

const toValidNumber = (value: NumericLike): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractFromSource = (
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null => {
  if (!source) return null;
  for (const key of keys) {
    const candidate = source[key];
    const numeric = toValidNumber(candidate as NumericLike);
    if (numeric !== null) return numeric;
  }
  return null;
};

const extractCoordinate = (object: DetectedObject, keys: string[]): number | null => {
  return (
    extractFromSource(object as Record<string, unknown>, keys) ??
    extractFromSource(object.details as Record<string, unknown>, keys) ??
    extractFromSource(object.detail as Record<string, unknown>, keys) ??
    null
  );
};

export const getObjectLatitude = (object: DetectedObject): number | null =>
  extractCoordinate(object, ['lat', 'latitude']);

export const getObjectLongitude = (object: DetectedObject): number | null =>
  extractCoordinate(object, ['lng', 'lon', 'long', 'longitude']);
