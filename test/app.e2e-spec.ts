import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { compare, getRounds } from 'bcrypt';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

describe('Application authentication (HTTP)', () => {
  let app: INestApplication<App>;
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const secret = 'authentication-test-secret-at-least-32-characters';
  const frontendOrigin = 'http://localhost:5173';
  const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
  };
  const credentials = {
    email: 'person@example.com',
    password: 'correct-horse-battery-staple',
  };

  function publicUser(user: StoredUser) {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }

  function publicUserJson(user: StoredUser) {
    return { ...publicUser(user), createdAt: user.createdAt.toISOString() };
  }

  function uniqueViolation() {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
  }

  const prisma = {
    user: {
      create: jest.fn(
        ({ data }: { data: { email: string; passwordHash: string } }) => {
          if (users.has(data.email)) throw uniqueViolation();
          const user: StoredUser = {
            ...data,
            id: `user-${users.size + 1}`,
            createdAt: new Date(),
          };
          users.set(user.email, user);
          return Promise.resolve(publicUser(user));
        },
      ),
      findUnique: jest.fn(
        ({
          where,
          select,
        }: {
          where: { id?: string; email?: string };
          select?: { passwordHash?: boolean };
        }) => {
          const user = [...users.values()].find((candidate) =>
            where.id
              ? candidate.id === where.id
              : candidate.email === where.email,
          );
          return Promise.resolve(
            user ? (select?.passwordHash ? user : publicUser(user)) : null,
          );
        },
      ),
    },
    refreshToken: {
      create: jest.fn(
        ({ data }: { data: Omit<StoredSession, 'id' | 'createdAt'> }) => {
          const session: StoredSession = {
            ...data,
            id: `session-${sessions.size + 1}`,
            createdAt: new Date(),
          };
          sessions.set(session.id, session);
          return Promise.resolve(session);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
        const session = [...sessions.values()].find(
          (candidate) => candidate.tokenHash === where.tokenHash,
        );
        const user = [...users.values()].find(
          (candidate) => candidate.id === session?.userId,
        );
        return Promise.resolve(
          session && user ? { ...session, user: publicUser(user) } : null,
        );
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; tokenHash: string; expiresAt: { gt: Date } };
          data: { tokenHash: string; expiresAt: Date };
        }) => {
          const session = sessions.get(where.id);
          if (
            !session ||
            session.tokenHash !== where.tokenHash ||
            session.expiresAt <= where.expiresAt.gt
          ) {
            return Promise.resolve({ count: 0 });
          }
          sessions.set(session.id, { ...session, ...data });
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };

  function cookie(response: request.Response, name: string): string {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    const value = cookies?.find((entry) => entry.startsWith(`${name}=`));
    expect(value).toBeDefined();
    return value!;
  }

  function cookieValue(response: request.Response, name: string) {
    return decodeURIComponent(
      cookie(response, name)
        .split(';')[0]
        .slice(name.length + 1),
    );
  }

  async function verifySessionCookies(response: request.Response) {
    for (const [name, maxAge] of [
      ['access_token', 900],
      ['refresh_token', 604800],
    ] as const) {
      const value = cookie(response, name);
      expect(value).toContain('HttpOnly');
      expect(value).toContain('SameSite=Lax');
      expect(value).toContain('Path=/');
      expect(value).toContain(`Max-Age=${maxAge}`);
    }
    const accessToken = cookieValue(response, 'access_token');
    const refreshToken = cookieValue(response, 'refresh_token');
    const claims = await app.get(JwtService).verifyAsync<{
      sub: string;
      email: string;
      iat: number;
      exp: number;
    }>(accessToken, { secret });
    expect(claims.exp - claims.iat).toBe(900);
    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return { accessToken, refreshToken, claims };
  }

  async function registerAndLogin() {
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send(credentials)
      .expect(201);
    return request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.FRONTEND_ORIGIN = frontendOrigin;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  beforeEach(() => {
    users.clear();
    sessions.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('keeps the existing root endpoint', () =>
    request(app.getHttpServer()).get('/').expect(200).expect('Hello World!'));

  it('creates a normalized user with a bcrypt hash and does not log in on signup', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ ...credentials, email: ' Person@Example.COM ' })
      .expect(201);
    const stored = users.get(credentials.email)!;

    expect(response.body).toEqual({
      message: 'Account created successfully',
      user: publicUserJson(stored),
    });
    expect(stored.passwordHash).toMatch(/^\$2b\$12\$/);
    expect(getRounds(stored.passwordHash)).toBe(12);
    expect(await compare(credentials.password, stored.passwordHash)).toBe(true);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sessions.size).toBe(0);
  });

  it.each([
    { ...credentials, email: 'invalid-email' },
    { ...credentials, password: 'short' },
    { ...credentials, role: 'admin' },
    { email: credentials.email },
  ])(
    'rejects invalid signup input before database writes: %j',
    async (body) => {
      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(body)
        .expect(400);
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );

  it.each(['/auth/sign-up', '/auth/login'])(
    'rejects passwords exceeding 72 UTF-8 bytes on %s',
    async (endpoint) => {
      for (const password of ['x'.repeat(73), 'é'.repeat(37)]) {
        await request(app.getHttpServer())
          .post(endpoint)
          .send({ ...credentials, password })
          .expect(400);
      }
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('accepts a 72-byte multibyte password and rejects a suffix instead of truncating it', async () => {
    const password = 'é'.repeat(36);
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ ...credentials, password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, password: `${password}x` })
      .expect(400);
    expect(sessions.size).toBe(0);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, password })
      .expect(200);
    await verifySessionCookies(login);
  });

  it.each(['/auth/sign-up', '/auth/login'])(
    'rejects malformed Unicode passwords on %s without a server error',
    async (endpoint) => {
      await request(app.getHttpServer())
        .post(endpoint)
        .send({ ...credentials, password: 'password\ud800' })
        .expect(400);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('returns a conflict for an existing normalized email', async () => {
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send(credentials)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({ ...credentials, email: 'PERSON@example.com' })
      .expect(409);
    expect(users.size).toBe(1);
  });

  it('sets both session cookies on login and stores only the refresh token hash', async () => {
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send(credentials)
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, email: ' PERSON@EXAMPLE.COM ' })
      .expect(200);
    const { claims, refreshToken } = await verifySessionCookies(response);
    const stored = users.get(credentials.email)!;
    const session = [...sessions.values()][0];

    expect(response.body).toEqual({
      message: 'Logged in successfully',
      user: publicUserJson(stored),
    });
    expect(claims.sub).toBe(stored.id);
    expect(claims.email).toBe(stored.email);
    expect(session.userId).toBe(stored.id);
    expect(session.tokenHash).toBe(
      createHash('sha256').update(refreshToken).digest('hex'),
    );
    expect(JSON.stringify([...sessions.values()])).not.toContain(refreshToken);
    expect(session.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 604_790_000,
    );
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 604_800_000,
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('gives the same unauthorized response for a wrong password and unknown email', async () => {
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send(credentials)
      .expect(201);
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, email: 'unknown@example.com' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toMatchObject({
      message: 'Invalid email or password',
    });
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    expect(unknownEmail.headers['set-cookie']).toBeUndefined();
    expect(sessions.size).toBe(0);
  });

  it('rejects login requests without an email', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ password: credentials.password })
      .expect(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the current user from a valid access cookie', async () => {
    const login = await registerAndLogin();
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `access_token=${cookieValue(login, 'access_token')}`)
      .expect(200);
    expect(response.body).toEqual(
      publicUserJson(users.get(credentials.email)!),
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([undefined, 'invalid-jwt'])(
    'rejects missing or malformed access cookies',
    async (token) => {
      const operation = request(app.getHttpServer()).get('/auth/me');
      if (token !== undefined) operation.set('Cookie', `access_token=${token}`);
      await operation.expect(401);
    },
  );

  it('rejects expired access tokens and invalid signatures', async () => {
    const login = await registerAndLogin();
    const { claims } = await verifySessionCookies(login);
    const jwt = app.get(JwtService);
    const expired = await jwt.signAsync(
      { sub: claims.sub, email: claims.email },
      { expiresIn: -1 },
    );
    const badSignature = await jwt.signAsync(
      { sub: claims.sub, email: claims.email },
      { secret: 'another-signing-secret' },
    );
    for (const token of [expired, badSignature]) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `access_token=${token}`)
        .expect(401);
    }
  });

  it('rejects signed access tokens without valid identity claims', async () => {
    const token = await app
      .get(JwtService)
      .signAsync({ sub: 123, email: null });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `access_token=${token}`)
      .expect(401);
  });

  it('rejects an access token after the account is deleted', async () => {
    const login = await registerAndLogin();
    users.delete(credentials.email);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `access_token=${cookieValue(login, 'access_token')}`)
      .expect(401);
  });

  it('rotates refresh tokens, rejects reuse, and keeps the new access cookie usable', async () => {
    const login = await registerAndLogin();
    const oldToken = cookieValue(login, 'refresh_token');
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${oldToken}`)
      .expect(200);
    const { accessToken, refreshToken } = await verifySessionCookies(refreshed);

    expect(refreshed.body).toEqual({
      message: 'Tokens refreshed successfully',
      user: publicUserJson(users.get(credentials.email)!),
    });
    expect(refreshToken).not.toBe(oldToken);
    expect(sessions.size).toBe(1);
    expect([...sessions.values()][0].tokenHash).toBe(
      createHash('sha256').update(refreshToken).digest('hex'),
    );
    const reuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${oldToken}`)
      .expect(401);
    expect(reuse.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `access_token=${accessToken}`)
      .expect(200);
  });

  it.each([undefined, 'invalid-token', 'a'.repeat(43)])(
    'rejects missing, malformed, or unknown refresh cookies',
    async (token) => {
      const operation = request(app.getHttpServer()).post('/auth/refresh');
      if (token !== undefined)
        operation.set('Cookie', `refresh_token=${token}`);
      const response = await operation.expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('rejects expired refresh sessions', async () => {
    const login = await registerAndLogin();
    [...sessions.values()][0].expiresAt = new Date(0);
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${cookieValue(login, 'refresh_token')}`)
      .expect(401);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('allows only one simultaneous rotation of the same refresh token', async () => {
    const login = await registerAndLogin();
    const token = cookieValue(login, 'refresh_token');
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', `refresh_token=${token}`),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    expect(
      results.find((response) => response.status === 401)!.headers[
        'set-cookie'
      ],
    ).toBeUndefined();
  });

  it.each(['/auth/sign-up', '/auth/login', '/auth/refresh'])(
    'rejects an untrusted browser origin on %s',
    async (endpoint) => {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Origin', 'https://untrusted.example')
        .send(credentials)
        .expect(403);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    },
  );

  it('rejects cross-site fetches without an Origin header', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Sec-Fetch-Site', 'cross-site')
      .send(credentials)
      .expect(403);
  });

  it('accepts the configured frontend origin and leaves GET /auth/me accessible', async () => {
    await request(app.getHttpServer())
      .post('/auth/sign-up')
      .set('Origin', frontendOrigin)
      .send(credentials)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', frontendOrigin)
      .send(credentials)
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Origin', 'https://another.example')
      .set('Cookie', `access_token=${cookieValue(login, 'access_token')}`)
      .expect(200);
  });

  it('sets Secure on both session cookies in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const login = await registerAndLogin();
      for (const name of ['access_token', 'refresh_token']) {
        expect(cookie(login, name)).toMatch(/;\s*Secure(?:;|$)/);
      }
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
