import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Header,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginDto, SignUpDto } from './dto/auth-dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtGuard } from './guards/jwt.guard';
import { CookieOriginGuard } from './cookie-origin.guard';

@Controller('auth')
@UseGuards(CookieOriginGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('sign-up')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  getCurrentUser(@CurrentUser('sub') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(dto);
    this.setAuthCookies(response, accessToken, refreshToken);
    return { message: 'Logged in successfully', user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.refresh_token;
    const refreshed = await this.authService.refresh(
      typeof token === 'string' ? token : undefined,
    );

    this.setAuthCookies(
      response,
      refreshed.accessToken,
      refreshed.refreshToken,
    );
    return { message: 'Tokens refreshed successfully', user: refreshed.user };
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const sharedCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookie('access_token', accessToken, {
      ...sharedCookieOptions,
      maxAge: 15 * 60 * 1000,
    });
    response.cookie('refresh_token', refreshToken, {
      ...sharedCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
