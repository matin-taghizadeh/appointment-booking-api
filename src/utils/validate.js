import mongoose from 'mongoose';
import { HttpError } from './errors.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertValid(errors) {
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
}

export function requireObjectId(value, name = 'id') {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `${name} is not a valid id`);
  return value;
}

export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
