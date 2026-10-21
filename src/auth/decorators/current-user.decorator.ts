import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { AccessTokenClaims, AuthRequest } from '../types/auth-request';

export const CurrentUser = createParamDecorator(
  (field: keyof AccessTokenClaims | undefined, context: ExecutionContext) => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return field === undefined ? user : user[field];
  },
);
