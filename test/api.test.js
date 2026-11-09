import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Booking } from '../src/models/Booking.js';
import { User } from '../src/models/User.js';

const cfg = {
  jwtSecret: 'test-secret',
  bcryptRounds: 4,
  openHour: 9,
  closeHour: 17,
  slotMinutes: 30,
  utcOffsetMinutes: 210,
};

let mongod;
let server;
let base;
let adminToken;
let aliToken;
let saraToken;
let shortService; // 30 min
let longService; // 60 min
let firstSlot; // tomorrow 09:00 local

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const register = async (name, email) =>
  (await call('POST', '/api/auth/register', { body: { name, email, password: 'password123' } })).body.token;

before(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
    } catch (err) {
      throw new Error(
        'Could not start the in-memory MongoDB (it downloads a binary on first run). ' +
          'Use a MongoDB you already have instead: TEST_MONGO_URI=mongodb://127.0.0.1:27017/booking-test npm test. ' +
          `Original error: ${err.message}`
      );
    }
  }

  await mongoose.connect(uri);
  // The test database is wiped, so refuse to run against anything not clearly named as a test DB.
  if (process.env.TEST_MONGO_URI && !/test/i.test(mongoose.connection.name)) {
    throw new Error('TEST_MONGO_URI must point to a database whose name contains "test"');
  }
  await mongoose.connection.dropDatabase();
  await Promise.all([Booking.syncIndexes(), User.syncIndexes()]);

  server = await new Promise((resolve) => {
    const s = createApp(cfg).listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;

  await User.create({
    name: 'Admin',
    email: 'admin@test.dev',
    passwordHash: await bcrypt.hash('password123', 4),
    role: 'admin',
  });
  adminToken = (await call('POST', '/api/auth/login', { body: { email: 'admin@test.dev', password: 'password123' } })).body.token;
  aliToken = await register('Ali', 'ali@test.dev');
  saraToken = await register('Sara', 'sara@test.dev');

  shortService = (await call('POST', '/api/services', { token: adminToken, body: { name: 'Short', durationMinutes: 30, price: 100 } })).body;
  longService = (await call('POST', '/api/services', { token: adminToken, body: { name: 'Long', durationMinutes: 60, price: 200 } })).body;

  // Tomorrow's date in the business's local time, then 09:00 local = 05:30 UTC
  const local = new Date(Date.now() + cfg.utcOffsetMinutes * 60_000 + 86_400_000);
  const date = local.toISOString().slice(0, 10);
  const availability = await call('GET', `/api/services/${shortService._id}/availability?date=${date}`);
  firstSlot = availability.body.availableStartTimes[0];
});

after(async () => {
  server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const offset = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
const book = (token, service, startsAt) =>
  call('POST', '/api/bookings', { token, body: { serviceId: service._id, startsAt } });

test('registration validates input and rejects duplicate emails', async () => {
  const bad = await call('POST', '/api/auth/register', { body: { name: 'A', email: 'nope', password: '123' } });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.details.name && bad.body.details.email && bad.body.details.password);

  const dup = await call('POST', '/api/auth/register', {
    body: { name: 'Ali Again', email: 'ALI@test.dev', password: 'password123' },
  });
  assert.equal(dup.status, 409);
});

test('login rejects wrong password and /me needs a token', async () => {
  const wrong = await call('POST', '/api/auth/login', { body: { email: 'ali@test.dev', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: aliToken })).body.user.email, 'ali@test.dev');
});

test('only admins can create services', async () => {
  const res = await call('POST', '/api/services', {
    token: aliToken,
    body: { name: 'Nope', durationMinutes: 30, price: 1 },
  });
  assert.equal(res.status, 403);
});

test('availability lists free start times in the future', async () => {
  assert.ok(firstSlot, 'expected at least one free slot tomorrow');
});

test('booking succeeds, then the same slot is rejected for another user', async () => {
  const first = await book(aliToken, shortService, firstSlot);
  assert.equal(first.status, 201);
  assert.equal(first.body.status, 'confirmed');

  const second = await book(saraToken, shortService, firstSlot);
  assert.equal(second.status, 409);
});

test('overlapping bookings of different lengths are rejected', async () => {
  // Ali holds 09:00-09:30. Sara takes 09:30-10:30 with the 60-minute service: no overlap, so it works.
  const free = await book(saraToken, longService, offset(firstSlot, 30));
  assert.equal(free.status, 201);

  // A 30-minute booking at 10:00 falls inside Sara's 09:30-10:30 booking, so it must fail
  const clash = await book(aliToken, shortService, offset(firstSlot, 60));
  assert.equal(clash.status, 409);
});

test('bookings outside business hours or off the grid are rejected', async () => {
  const early = await book(aliToken, shortService, offset(firstSlot, -60)); // 08:00 local
  assert.equal(early.status, 422);
  const offGrid = await book(aliToken, shortService, offset(firstSlot, 7)); // 09:07
  assert.equal(offGrid.status, 422);
  const past = await book(aliToken, shortService, '2020-01-01T09:00:00+03:30');
  assert.equal(past.status, 422);
});

test('customers only see their own bookings, admins see all', async () => {
  const ali = await call('GET', '/api/bookings', { token: aliToken });
  assert.ok(ali.body.data.every((b) => b.status));
  assert.equal(ali.body.meta.total, 1);

  const admin = await call('GET', '/api/bookings', { token: adminToken });
  assert.equal(admin.body.meta.total, 2);

  const saraBooking = admin.body.data.find((b) => b.user.email === 'sara@test.dev');
  const peek = await call('GET', `/api/bookings/${saraBooking._id}`, { token: aliToken });
  assert.equal(peek.status, 404);
});

test('cancelling frees the slot for someone else', async () => {
  const mine = (await call('GET', '/api/bookings', { token: aliToken })).body.data[0];
  const cancel = await call('PATCH', `/api/bookings/${mine._id}/cancel`, { token: aliToken });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.status, 'cancelled');

  const again = await call('PATCH', `/api/bookings/${mine._id}/cancel`, { token: aliToken });
  assert.equal(again.status, 409);

  const rebook = await book(saraToken, shortService, firstSlot);
  assert.equal(rebook.status, 201);
});

test('concurrent requests for one slot: exactly one wins', async () => {
  const target = offset(firstSlot, 4 * 60); // 13:00 local, still free
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => book(i % 2 ? aliToken : saraToken, shortService, target))
  );
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 201).length, 1);
  assert.equal(statuses.filter((s) => s === 409).length, 7);
});
