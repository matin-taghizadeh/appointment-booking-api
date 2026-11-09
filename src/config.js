import './env.js';

export function loadConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT) || 3000,
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/booking-api',
    jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: 10,
    openHour: Number(process.env.OPEN_HOUR ?? 9),
    closeHour: Number(process.env.CLOSE_HOUR ?? 17),
    slotMinutes: Number(process.env.SLOT_MINUTES ?? 30),
    utcOffsetMinutes: Number(process.env.UTC_OFFSET_MINUTES ?? 210),
    ...overrides,
  };
}
