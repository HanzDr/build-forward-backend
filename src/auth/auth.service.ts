import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, SignUpDto } from './dto/auth-dto';

const PUBLIC_USER_SELECT = { id: true, email: true, createdAt: true } as const;
const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH =
  '$2b$12$cdRTu/JBtxe.v0zPP.0dd.gLsenwG4lLAYVHuAcdqSCCN7Co8qGN6';

type PublicUser = { id: string; email: string; createdAt: Date };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signUp(dto: SignUpDto) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { email, passwordHash },
        select: PUBLIC_USER_SELECT,
      });
      return {
        message: 'Account created successfully',
        user: this.publicUser(user),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { ...PUBLIC_USER_SELECT, passwordHash: true },
    });

    // Perform password verification even for an unknown email.
    const passwordMatches = await compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.createTokens(user);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
      },
    });
    return tokens;
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return this.publicUser(user);
  }

  async refresh(refreshToken: string | undefined) {
    if (
      typeof refreshToken !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tokenHash: true,
        expiresAt: true,
        user: { select: PUBLIC_USER_SELECT },
      },
    });
    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.createTokens(stored.user);
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, tokenHash, expiresAt: { gt: new Date() } },
      data: {
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
      },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return tokens;
  }

  private async createTokens(user: PublicUser) {
    return {
      accessToken: await this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
      }),
      refreshToken: randomBytes(32).toString('base64url'),
      user: this.publicUser(user),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: PublicUser) {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
