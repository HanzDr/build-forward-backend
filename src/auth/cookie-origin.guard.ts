import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const origin = request.get('origin');
    if (origin === undefined) {
      if (request.get('sec-fetch-site') === 'cross-site') {
        throw new ForbiddenException('Request origin is not allowed');
      }

      return true;
    }

    const sameOrigin = `${request.protocol}://${request.get('host') ?? ''}`;
    const frontendOrigin = this.config.get<string>('FRONTEND_ORIGIN');

    if (
      origin !== 'null' &&
      (origin === sameOrigin ||
        (Boolean(frontendOrigin) && origin === frontendOrigin))
    ) {
      return true;
    }

    throw new ForbiddenException('Request origin is not allowed');
  }
}
