import { Router } from 'express';
import { Booking } from '../models/Booking.js';
import { Service } from '../models/Service.js';
import { HttpError, asyncHandler } from '../utils/errors.js';
import { buildSlots, checkSlotFit } from '../utils/slots.js';
import { assertValid, parseDate, parsePagination, requireObjectId } from '../utils/validate.js';
import mongoose from 'mongoose';

export function bookingsRouter(cfg, auth) {
  const router = Router();
  router.use(auth.authenticate);

  const isAdmin = (req) => req.user.role === 'admin';

  // Customers can only see their own bookings; anything else looks like "not found".
  const findVisibleOrFail = async (req) => {
    requireObjectId(req.params.id);
    const booking = await Booking.findById(req.params.id);
    if (!booking || (!isAdmin(req) && !booking.user.equals(req.user._id))) {
      throw new HttpError(404, 'Booking not found');
    }
    return booking;
  };

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { serviceId, startsAt, notes } = req.body ?? {};
      const errors = {};
      if (!mongoose.isValidObjectId(serviceId)) errors.serviceId = 'must be a valid id';
      const start = parseDate(startsAt);
      if (!start) errors.startsAt = 'must be an ISO 8601 date-time, e.g. 2026-12-01T09:30:00+03:30';
      if (notes !== undefined && (typeof notes !== 'string' || notes.length > 500)) {
        errors.notes = 'must be a string up to 500 characters';
      }
      assertValid(errors);

      const service = await Service.findOne({ _id: serviceId, isActive: true });
      if (!service) throw new HttpError(404, 'Service not found');

      if (start <= new Date()) assertValid({ startsAt: 'must be in the future' });
      const fit = checkSlotFit(start, service.durationMinutes, cfg);
      if (!fit.ok) assertValid({ startsAt: fit.reason });

      try {
        const booking = await Booking.create({
          user: req.user._id,
          service: service._id,
          startsAt: start,
          endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
          slots: buildSlots(start, service.durationMinutes, cfg.slotMinutes),
          notes,
        });
        res.status(201).location(`/api/bookings/${booking.id}`).json(booking);
      } catch (err) {
        // The unique index rejected an overlapping booking, even under concurrent requests.
        if (err.code === 11000) throw new HttpError(409, 'That time slot is no longer available');
        throw err;
      }
    })
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, limit, skip } = parsePagination(req.query);
      const filter = isAdmin(req) ? {} : { user: req.user._id };

      if (req.query.status) {
        if (!['confirmed', 'cancelled'].includes(req.query.status)) {
          assertValid({ status: 'must be "confirmed" or "cancelled"' });
        }
        filter.status = req.query.status;
      }
      for (const [param, op] of [['from', '$gte'], ['to', '$lte']]) {
        if (req.query[param]) {
          const d = parseDate(req.query[param]);
          if (!d) assertValid({ [param]: 'must be an ISO 8601 date-time' });
          filter.startsAt = { ...filter.startsAt, [op]: d };
        }
      }

      let query = Booking.find(filter)
        .sort({ startsAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('service', 'name durationMinutes price');
      if (isAdmin(req)) query = query.populate('user', 'name email');

      const [data, total] = await Promise.all([query, Booking.countDocuments(filter)]);
      res.json({ data, meta: { page, limit, total } });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const booking = await findVisibleOrFail(req);
      await booking.populate('service', 'name durationMinutes price');
      res.json(booking);
    })
  );

  router.patch(
    '/:id/cancel',
    asyncHandler(async (req, res) => {
      const booking = await findVisibleOrFail(req);
      if (booking.status === 'cancelled') throw new HttpError(409, 'Booking is already cancelled');
      if (booking.startsAt <= new Date()) throw new HttpError(409, 'Past bookings cannot be cancelled');

      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      await booking.save(); // leaves the partial unique index, which frees the slots
      res.json(booking);
    })
  );

  return router;
}
