<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Authentication

Set `DATABASE_URL` and `JWT_SECRET` in `.env` (see `.env.example`). Generate a
random JWT secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep this secret private and stable across server instances and restarts. It
signs the access tokens.

Apply the database migrations and generate the Prisma client before starting:

```bash
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

`POST /auth/sign-up` accepts:

```json
{
  "email": "user@example.com",
  "password": "a-long-password"
}
```

It returns `201` with `message: "Account created successfully"` and the user's
`id`, `email`, and `createdAt` inside `user`. Email
addresses are trimmed and lowercased. Passwords must contain at least 8 characters
and fit within 72 UTF-8 bytes; signup stores bcrypt hashes with cost 12. Login
also enforces the byte limit to prevent bcrypt from truncating passwords.
An existing email returns `409`.

Existing Argon2 hashes cannot be converted to bcrypt without the plaintext
password. Accounts with those hashes need a password reset before logging in.

Signup creates the account without setting authentication cookies. No email
verification is required. Sign in through the login endpoint afterward.

`POST /auth/login` accepts the same email and password fields. It returns `200`:

```json
{
  "message": "Logged in successfully",
  "user": {
    "id": "<user-id>",
    "email": "user@example.com",
    "createdAt": "<ISO timestamp>"
  }
}
```

An unknown email or incorrect password returns the same `401` error. Invalid
request fields return `400`. Passwords and hashes are omitted from responses.

Login sets two cookies: `access_token` (a 15-minute JWT) and `refresh_token`
(a random token valid for 7 days). Both use `HttpOnly`, `SameSite=Lax`, and
`Path=/`. Set `NODE_ENV=production` to enable `Secure` cookies over HTTPS.
Tokens are omitted from JSON responses. Only a SHA-256 hash of each refresh
token is stored in the database.

`GET /auth/me` reads and verifies the access cookie, then returns the current
user's `id`, `email`, and `createdAt`. A missing, invalid, or expired access
token returns `401`.

`POST /auth/refresh` reads the refresh cookie, replaces it with a new refresh
token, and sets a new access cookie. It returns
`{ "message": "Tokens refreshed successfully", "user": { ... } }`.
Missing, expired, or reused refresh tokens return `401`. The database updates
the stored hash atomically, so only one simultaneous refresh can succeed.
Serialize refresh requests on the frontend; if a successful refresh response
is lost, sign in again. Expired refresh rows require periodic cleanup.

For a frontend on another origin, set `FRONTEND_ORIGIN` to that exact origin
(e.g. `http://localhost:5173`, without a trailing slash). The API enables CORS
credentials for that origin, and auth endpoints reject other browser origins.
The cookie configuration assumes the frontend and API are on the same site
(different localhost ports also work).

Include credentials on frontend requests so the browser stores and sends the
cookie:

```typescript
await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'a-long-password',
  }),
});
```

The tests exercise real password hashing, token signing, validation, cookie
authentication, and refresh rotation with a mocked database; they do not require
a running PostgreSQL server.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
