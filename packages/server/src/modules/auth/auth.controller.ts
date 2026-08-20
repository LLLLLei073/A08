import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginDto, ChangePasswordDto, SetPasswordDto } from '@ai-party-school/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserService } from '../user/user.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getAuthCookie, setAuthCookies, setAccessTokenCookie, clearAuthCookies } from '../../common/utils/cookie.util';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    // P0-7：token 写入 HttpOnly Cookie，前端不再落地到 localStorage，杜绝 XSS 窃取
    setAuthCookies(res, req, { accessToken: result.accessToken, refreshToken: result.refreshToken });
    return { user: result.user, forceChangePassword: result.forceChangePassword };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // 优先从 HttpOnly Cookie 读取 refresh token；保留 body 回退以兼容非浏览器客户端
    const token = getAuthCookie(req, 'refresh') || (req.body as any)?.refreshToken;
    const result = await this.auth.refresh(token);
    setAccessTokenCookie(res, req, result.accessToken);
    return { success: true };
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res, req);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser('sub') userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { org: true },
    });
    if (!user) return null;
    const { password, ...rest } = user;
    return this.userService.mapEntity({ ...rest, orgName: rest.org?.name });
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser('sub') userId: number,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.changePassword(userId, dto.oldPassword, dto.newPassword);
    setAuthCookies(res, req, result);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  async setPassword(
    @CurrentUser('sub') userId: number,
    @Body() dto: SetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.setPassword(userId, dto.newPassword);
    setAuthCookies(res, req, result);
    return { success: true };
  }
}
