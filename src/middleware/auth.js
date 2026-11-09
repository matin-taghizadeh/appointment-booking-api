import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/errors.js';

export function createAuth(cfg) {
  const signToken = (user) =>
    jwt.sign({ sub: user.id, role: user.role }, cfg.jwtSecret, { expiresIn: cfg.jwtExpiresIn });

  const authenticate = asyncHandler(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Missing or malformed Authorization header');
    }

    let payload;
    try {
      payload = jwt.verify(token, cfg.jwtSecret);
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, 'User no longer exists');
    req.user = user;
    next();
  });

  const requireAdmin = (req, res, next) =>
    req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Admin access required'));

  return { signToken, authenticate, requireAdmin };
}
