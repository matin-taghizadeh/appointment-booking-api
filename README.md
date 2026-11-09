# Appointment Booking API

A production-style REST API for businesses that take appointments: clinics, salons,
consultants, clubs, gyms. Customers register, browse services, see free time slots
and book. Admins manage services and see every booking.

Built with **Node.js, Express and MongoDB (Mongoose)**.

## Highlights

- **JWT authentication** with hashed passwords (bcrypt) and role-based access (`customer`, `admin`)
- **Double-booking is impossible**, even when two people click "Book" at the same instant.
  This is enforced by a unique MongoDB index, not by a check-then-insert that can race
  (see "How double-booking is prevented" below, and the concurrency test)
- **Availability endpoint**: returns the free start times for a service on any day,
  respecting business hours, service length and existing bookings
- Services of different lengths (30, 60, 90 minutes...) share one calendar correctly
- Customers can only see and cancel their own bookings; cancelling frees the slot instantly
- Input validation with field-level error messages, consistent JSON errors, pagination and filters
- Integration tests, including a concurrency test (8 simultaneous requests, exactly 1 wins)

## Quick start

Requirements: Node.js 18+ and a MongoDB instance (local, Docker, or Atlas).

```bash
cp .env.example .env     # then edit MONGO_URI and JWT_SECRET
npm install
npm run seed             # optional: demo admin + sample services
npm start                # http://localhost:3000
npm test                 # starts a temporary in-memory MongoDB (see Troubleshooting)
```

Business rules are configurable in `.env`: opening hours, slot length, and the
business's UTC offset (default 210 minutes = Iran, UTC+3:30).

## Troubleshooting

- **`Cannot find package 'express'` (or any package):** dependencies are not installed.
  Run `npm install` inside the project folder and check that a `node_modules` folder appears.
- **`npm install` fails or hangs (403, ETIMEDOUT):** point npm at a mirror that works for you,
  then run `npm install` again: `npm config set registry <MIRROR_URL>`.
  Revert with `npm config delete registry`.
- **`npm test` cannot start the in-memory MongoDB:** it downloads a MongoDB binary on first run.
  If that is blocked, test against a MongoDB you already run instead
  (the database name must contain "test" because it is wiped):
  `TEST_MONGO_URI=mongodb://127.0.0.1:27017/booking-test npm test`
- **`.env` is ignored:** the file must be named exactly `.env` and sit next to `package.json`.
  Variables already set in your shell take priority over the file.
- **Server cannot connect:** check that MongoDB is running and `MONGO_URI` is correct.

## Endpoints

| Method                | Path                                             | Access      | Description                                                                 |
| --------------------- | ------------------------------------------------ | ----------- | --------------------------------------------------------------------------- |
| POST                  | `/api/auth/register`                             | public      | Create a customer account, returns a token                                  |
| POST                  | `/api/auth/login`                                | public      | Log in, returns a token                                                     |
| GET                   | `/api/auth/me`                                   | user        | Current user                                                                |
| GET                   | `/api/services`                                  | public      | List active services                                                        |
| GET                   | `/api/services/:id/availability?date=YYYY-MM-DD` | public      | Free start times that day                                                   |
| POST / PATCH / DELETE | `/api/services[/:id]`                            | admin       | Manage services (DELETE deactivates)                                        |
| POST                  | `/api/bookings`                                  | user        | Book a slot                                                                 |
| GET                   | `/api/bookings`                                  | user        | Own bookings (admin: all). Filters: `status`, `from`, `to`, `page`, `limit` |
| GET                   | `/api/bookings/:id`                              | owner/admin | One booking                                                                 |
| PATCH                 | `/api/bookings/:id/cancel`                       | owner/admin | Cancel a future booking                                                     |

## Example

```bash
# 1. Register and keep the token
curl -X POST localhost:3000/api/auth/register -H 'content-type: application/json' \
  -d '{"name":"Ali","email":"ali@example.com","password":"password123"}'

# 2. See what is free tomorrow
curl "localhost:3000/api/services/<SERVICE_ID>/availability?date=2026-12-01"

# 3. Book one of the returned times
curl -X POST localhost:3000/api/bookings \
  -H 'content-type: application/json' -H "authorization: Bearer <TOKEN>" \
  -d '{"serviceId":"<SERVICE_ID>","startsAt":"2026-12-01T05:30:00.000Z"}'
```

## How double-booking is prevented

The calendar is divided into slots (30 minutes by default). Each booking stores the
list of slots it occupies: a 90-minute booking occupies 3. The `Booking` collection has a
**unique index on that list, restricted to confirmed bookings**:

```js
bookingSchema.index(
  { slots: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } },
);
```

If two requests try to take the same slot, the database accepts one and rejects the
other (the API answers `409 Conflict`). Cancelling a booking removes it from the
index automatically, so the slot becomes free again. No locks, no race conditions.

## Project structure

```
src/
  app.js            app factory (used by server and tests)
  server.js         connects to MongoDB and starts listening
  config.js         environment-based configuration
  models/           User, Service, Booking (Mongoose)
  routes/           auth, services, bookings
  middleware/       JWT authentication and role checks
  utils/            slot math, validation, error handling
test/api.test.js    integration tests
scripts/seed.js     demo data
```

## Ideas for extending it

Email/SMS reminders, multiple staff members each with their own calendar, payment
integration, a React or Telegram-bot front end on top of this API.

## Author

Matin: backend developer (Node.js, Express, MongoDB). Available for freelance work.

Email : matin.taghizade.official@gmail.com

Telegram ID : matin_tgh1
