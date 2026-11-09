import { Router } from 'express';
import { Booking } from '../models/Booking.js';
import { Service } from '../models/Service.js';
import { HttpError, asyncHandler } from '../utils/errors.js';
import { buildSlots, localDayStart } from '../utils/slots.js';
import { assertValid, requireObjectId } from '../utils/validate.js';

export function servicesRouter(cfg, auth) {
  const router = Router();

  function validateService(b, partial = false) {
    const errors = {};
    const has = (k) => b[k] !== undefined;

    if (!partial || has('name')) {
      if (typeof b.name !== 'string' || !b.name.trim()) errors.name = 'is required';
    }
    if (!partial || has('durationMinutes')) {
      const d = b.durationMinutes;
      const maxMinutes = (cfg.closeHour - cfg.openHour) * 60;
      if (!Number.isInteger(d) || d <= 0) errors.durationMinutes = 'must be a positive integer';
      else if (d % cfg.slotMinutes !== 0) errors.durationMinutes = `must be a multiple of ${cfg.slotMinutes}`;
      else if (d > maxMinutes) errors.durationMinutes = `cannot exceed business hours (${maxMinutes} minutes)`;
    }
    if (!partial || has('price')) {
      if (typeof b.price !== 'number' || !(b.price >= 0)) errors.price = 'must be a number >= 0';
    }
    if (has('isActive') && typeof b.isActive !== 'boolean') errors.isActive = 'must be true or false';
    assertValid(errors);
  }

  const findOrFail = async (id) => {
    requireObjectId(id);
    const service = await Service.findById(id);
    if (!service) throw new HttpError(404, 'Service not found');
    return service;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ data: await Service.find({ isActive: true }).sort({ name: 1 }) });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await findOrFail(req.params.id));
    })
  );

  // Free start times for a service on a given local date: GET /api/services/:id/availability?date=2026-12-01
  router.get(
    '/:id/availability',
    asyncHandler(async (req, res) => {
      const service = await findOrFail(req.params.id);
      const dayStart = localDayStart(req.query.date, cfg.utcOffsetMinutes);
      if (!dayStart) throw new HttpError(422, 'Validation failed', { date: 'must be a valid date: YYYY-MM-DD' });

      const HOUR = 3_600_000;
      const open = dayStart.getTime() + cfg.openHour * HOUR;
      const close = dayStart.getTime() + cfg.closeHour * HOUR;
      const step = cfg.slotMinutes * 60_000;

      const bookings = await Booking.find(
        { status: 'confirmed', startsAt: { $lt: new Date(close) }, endsAt: { $gt: new Date(open) } },
        'slots'
      );
      const taken = new Set(bookings.flatMap((b) => b.slots.map((s) => s.getTime())));

      const free = [];
      const now = Date.now();
      for (let t = open; t + service.durationMinutes * 60_000 <= close; t += step) {
        if (t <= now) continue;
        const slots = buildSlots(new Date(t), service.durationMinutes, cfg.slotMinutes);
        if (slots.every((s) => !taken.has(s.getTime()))) free.push(new Date(t).toISOString());
      }

      res.json({ service: service.id, date: req.query.date, availableStartTimes: free });
    })
  );

  router.post(
    '/',
    auth.authenticate,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      validateService(body);
      const service = await Service.create({
        name: body.name,
        description: body.description,
        durationMinutes: body.durationMinutes,
        price: body.price,
      });
      res.status(201).json(service);
    })
  );

  router.patch(
    '/:id',
    auth.authenticate,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const service = await findOrFail(req.params.id);
      const body = req.body ?? {};
      validateService(body, true);
      for (const key of ['name', 'description', 'durationMinutes', 'price', 'isActive']) {
        if (body[key] !== undefined) service[key] = body[key];
      }
      await service.save();
      res.json(service);
    })
  );

  // Soft delete: existing bookings keep pointing at the service.
  router.delete(
    '/:id',
    auth.authenticate,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const service = await findOrFail(req.params.id);
      service.isActive = false;
      await service.save();
      res.json(service);
    })
  );

  return router;
}
