import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../database/data-source.js';
import { User } from '../entities/user.entity.js';
import { UserRole } from '../enums/role.enum.js';
import { ApiError } from '../utils/errors.js';

// Validate X-User-Id header
export async function authenticateUserMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const userId = req.header('X-User-Id');

    // User header missing
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    // User header present, but user doesn't exist
    if (!user) {
      throw new ApiError(401, 'Unauthorized');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

// Validate user's role
export function requireRoleMiddleware(allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Unauthorized'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'Forbidden'));
    }

    next();
  };
}
