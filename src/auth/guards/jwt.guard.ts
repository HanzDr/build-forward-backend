import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthRequest } from '../types/auth-request';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookies: unknown = request.cookies;
    const token: unknown =
      typeof cookies === 'object' && cookies !== null && !Array.isArray(cookies)
        ? (cookies as Record<string, unknown>).access_token
        : undefined;

    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload: unknown = await this.jwtService.verifyAsync(token);

      if (
        typeof payload !== 'object' ||
        payload === null ||
        Array.isArray(payload)
      ) {
        throw new Error('Invalid access token');
      }

      const claims = payload as Record<string, unknown>;
      if (
        typeof claims.sub !== 'string' ||
        !claims.sub.trim() ||
        typeof claims.email !== 'string' ||
        !claims.email.trim() ||
        typeof claims.exp !== 'number' ||
        !Number.isFinite(claims.exp)
      ) {
        throw new Error('Invalid access token claims');
      }

      request.user = {
        sub: claims.sub,
        email: claims.email,
        exp: claims.exp,
        ...(typeof claims.iat === 'number' && Number.isFinite(claims.iat)
          ? { iat: claims.iat }
          : {}),
      };

      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
