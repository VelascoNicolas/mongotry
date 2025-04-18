/* eslint-disable @typescript-eslint/no-unused-vars */
import { Body, Controller, Get, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthUserDto } from '../../domain/dtos';
import { ChangePasswordDto } from '../../domain/dtos/password/chance-password';
import { AuthGuard, Roles } from './guards/auth.guard';
import { AuthGuard as GAuthGuard } from '@nestjs/passport';
import { Role } from '../../domain/enums';
import { FileInterceptor } from '@nestjs/platform-express';
import { User, Token } from './decorators';
import { CurrentUser } from './interfaces/current-user.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Endpoint para login
  @Post('/login')
  async loginUser(@Body() loginDto: AuthUserDto)/*: Promise<UserDto & { accessToken: string; refreshToken: string }>*/ {
    return await this.authService.loginUser(loginDto);
  }

  // Endpoints para autenticación con Google
  @Get('google/signin')
  @UseGuards(GAuthGuard('google'))
  async googleSignIn(@Req() req) {}

  @Get('google/signin/callback')
  @UseGuards(GAuthGuard('google'))
  async googleSignInCallback(@Req() req) {
    return this.authService.googleSignIn(req);
  }

  // Endpoint para verificar token y generar RefreshToken
  @UseGuards(AuthGuard)
  @Post('verify')
  @ApiBearerAuth('bearerAuth')
  verifyToken(@User() user: CurrentUser, @Token() token: string) {
    return this.authService.generateRefreshToken(token);
  }

  // Endpoint para subir imágenes
  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }> {
    const url = await this.authService.uploadImage(file);
    return { url };
  }
  
  // Endpoint para cambiar contraseña
  @Patch('change-password')
  @ApiBearerAuth('bearerAuth')
  @ApiBody({ type: ChangePasswordDto })
  @UseGuards(AuthGuard)
  async changePassword(
    @User() user: CurrentUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return await this.authService.changePassword(user.id, changePasswordDto);
  }
  //test endpoint
  @Get('/getUserById')
  async getUserById(@Query('id') id: string) {
    return await this.authService.getUserById(id)
  }
}