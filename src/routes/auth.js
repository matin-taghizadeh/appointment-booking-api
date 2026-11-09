import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { User } from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/errors.js';
import { EMAIL_RE, assertValid } from '../utils/validate.js';

export function authRouter(cfg, auth) {
  const router = Router();

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const { name, email, password } = req.body ?? {};
      const errors = {};
      if (typeof name !== 'string' || name.trim().length < 2) errors.name = 'must be at least 2 characters';
      if (typeof email !== 'string' || !EMAIL_RE.test(email)) errors.email = 'must be a valid email address';
      if (typeof password !== 'string' || password.length < 8) errors.password = 'must be at least 8 characters';
      assertValid(errors);

      if (await User.exists({ email: email.toLowerCase().trim() })) {
        throw new HttpError(409, 'An account with this email already exists');
      }

      const passwordHash = await bcrypt.hash(password, cfg.bcryptRounds);
      const user = await User.create({ name, email, passwordHash }); // role is always "customer" here
      res.status(201).json({ user, token: auth.signToken(user) });
    })
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw new HttpError(422, 'Validation failed', { email: 'required', password: 'required' });
      }

      const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
      const valid = user && (await bcrypt.compare(password, user.passwordHash));
      if (!valid) throw new HttpError(401, 'Invalid email or password'); // same message for both cases

      res.json({ user, token: auth.signToken(user) });
    })
  );

  router.get('/me', auth.authenticate, (req, res) => res.json({ user: req.user }));

  return router;
}
