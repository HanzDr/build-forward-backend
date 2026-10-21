import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService refresh sessions', () => {
  const secret = 'authentication-test-secret-at-least-32-characters';
  const rawToken = 'a'.repeat(43);
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({ secret, signOptions: { expiresIn: 900 } }),
    );
  });

  it.each([undefined, '', 'invalid-token', 'a'.repeat(44)])(
    'rejects missing or malformed refresh tokens before a database lookup',
    async (token) => {
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects expired sessions without rotating them', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(0),
      user,
    });

    await expect(service.refresh(rawToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the loser of a concurrent refresh instead of returning its new tokens', async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh(rawToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('preserves unexpected database errors', async () => {
    const failure = new Error('Database unavailable');
    prisma.refreshToken.findUnique.mockRejectedValue(failure);

    await expect(service.refresh(rawToken)).rejects.toBe(failure);
  });
});
