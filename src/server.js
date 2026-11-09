import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Booking } from './models/Booking.js';

const cfg = loadConfig();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be set in production');
  process.exit(1);
}

await mongoose.connect(cfg.mongoUri);
await Booking.init(); // make sure the unique slot index exists before taking requests

const server = createApp().listen(cfg.port, () => {
  console.log(`Booking API running on http://localhost:${cfg.port}`);
});

const shutdown = async () => {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
