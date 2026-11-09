import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { loadConfig } from '../src/config.js';
import { Service } from '../src/models/Service.js';
import { User } from '../src/models/User.js';

const cfg = loadConfig();
await mongoose.connect(cfg.mongoUri);

const email = process.env.ADMIN_EMAIL || 'admin@example.com';
const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

if (!(await User.exists({ email }))) {
  await User.create({
    name: 'Admin',
    email,
    passwordHash: await bcrypt.hash(password, cfg.bcryptRounds),
    role: 'admin',
  });
  console.log(`Created admin: ${email} / ${password}  (demo credentials, change them)`);
}

if ((await Service.countDocuments()) === 0) {
  await Service.insertMany([
    { name: 'Consultation', description: 'Initial 30-minute consultation', durationMinutes: 30, price: 500000 },
    { name: 'Standard Session', description: 'One hour session', durationMinutes: 60, price: 900000 },
    { name: 'Extended Session', description: 'Ninety minutes', durationMinutes: 90, price: 1300000 },
  ]);
  console.log('Created 3 sample services');
}

await mongoose.disconnect();
