import type { Request } from 'express';

export type AccessTokenClaims = {
  sub: string;
  email: string;
  exp: number;
  iat?: number;
};

export type AuthRequest = Request & {
  user?: AccessTokenClaims;
};
