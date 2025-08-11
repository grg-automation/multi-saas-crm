import { HttpService } from '@nestjs/axios'; // Add HttpService
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { firstValueFrom } from 'rxjs'; // Add RxJS
import { TwoFactorService } from '../two-factor/two-factor.service';
import { UserService } from '../user/user.service';
import { JwtService } from './jwt.service';
import {
  AccountLockedException,
  AuthUser,
  InvalidCredentialsException,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  TokenPair,
  TwoFactorRequiredException,
} from './types';

// Assume CreateUserDto is updated to include tenantId
interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly twoFactorService: TwoFactorService,
    private readonly httpService: HttpService, // Inject HttpService
  ) {}

  async login(loginDto: LoginDto): Promise<TokenPair> {
    const { email, password, twoFactorCode, tenantId } = loginDto;
    try {
      console.log(
        `Login attempt for email: ${email} at 01:53 AM +05, Tuesday, August 12, 2025`,
      );
      const user = await this.userService.findActiveByEmail(email);
      if (!user) {
        console.log(`User not found for email: ${email}`);
        throw new InvalidCredentialsException('Invalid email or password');
      }
      console.log(
        `User found: ${user.email}, isActive: ${user.isActive}, isVerified: ${user.isVerified}`,
      );
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        console.log(`Account locked until: ${user.lockedUntil}`);
        throw new AccountLockedException('Account is temporarily locked');
      }
      if (!user.hashedPassword) {
        console.log(`User ${user.email} has no local password (Auth0 managed)`);
        throw new InvalidCredentialsException('Invalid email or password');
      }
      const isPasswordValid = await bcrypt.compare(
        password,
        user.hashedPassword,
      );
      console.log(`Password valid: ${isPasswordValid}`);
      if (!isPasswordValid) {
        await this.userService.incrementFailedLoginAttempts(user.id);
        throw new InvalidCredentialsException('Invalid email or password');
      }
      if (user.twoFactorEnabled) {
        console.log(`2FA enabled for user: ${email}`);
        if (!twoFactorCode) {
          throw new TwoFactorRequiredException(
            'Two-factor authentication code required',
          );
        }
        const isValid2FA = await this.twoFactorService.verifyTwoFactorCode(
          user.id,
          twoFactorCode,
        );
        if (!isValid2FA) {
          console.log(`Invalid 2FA code for user: ${email}`);
          throw new InvalidCredentialsException(
            'Invalid two-factor authentication code',
          );
        }
        console.log(`2FA verification successful for user: ${email}`);
      }
      await this.userService.resetFailedLoginAttempts(user.id);
      const resolvedTenantId = tenantId || user.tenantId || 'default-tenant'; // Use user.tenantId
      const role = user.role || (user.isSuperuser ? 'ADMIN' : 'MANAGER');
      console.log(
        `Generating tokens for user: ${email}, tenant: ${resolvedTenantId}, role: ${role}`,
      );
      const tokenPair = this.jwtService.generateTokenPair(
        user,
        resolvedTenantId,
        role,
      );
      console.log(`Login successful for user: ${email}`);
      return tokenPair;
    } catch (error) {
      console.error(`Login error for ${email}:`, error.message);
      if (
        error instanceof TwoFactorRequiredException ||
        error instanceof InvalidCredentialsException ||
        error instanceof AccountLockedException
      ) {
        throw error;
      }
      console.error(`Unexpected login error:`, error);
      throw new UnauthorizedException('Login failed');
    }
  }

  async register(
    registerDto: RegisterDto,
  ): Promise<{ message: string; userId: string; email: string }> {
    const { email, password, passwordConfirm, firstName, lastName } =
      registerDto;
    try {
      console.log(
        `Registration attempt for email: ${email} at 01:50 AM +05, Tuesday, August 12, 2025`,
      );
      if (password !== passwordConfirm) {
        console.log('Password confirmation mismatch');
        throw new BadRequestException('Passwords do not match');
      }
      this.validatePasswordStrength(password);
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        console.log(`User already exists: ${email}`);
        throw new BadRequestException(
          `User with email ${email} already exists`,
        );
      }
      const user = await this.userService.create({
        email,
        password, // UserService will handle hashing
        firstName,
        lastName,
        tenantId: 'pending', // Placeholder until tenant is created
        role: 'ADMIN', // First user is tenant admin
      } as CreateUserDto); // Type assertion to match updated DTO
      const tenantId = email.split('@')[0] + '-' + Date.now().toString(36); // Example: john-66b9f1a
      const tenantRequest = {
        organizationName: `${firstName} ${lastName}'s Org`,
        tier: 'starter',
        domains: [],
        resources: {
          cpu: { request: '200m', limit: '500m' },
          memory: { request: '256Mi', limit: '512Mi' },
          storage: { size: '10Gi' },
        },
        database: { type: 'postgres', version: '15' },
        tenantId,
      };
      await firstValueFrom(
        this.httpService.post(
          `http://localhost:3001/${tenantId}/api/v1/tenants`,
          tenantRequest,
          {
            headers: {
              Authorization: `Bearer ${await this.jwtService.generateInternalToken()}`,
            },
          },
        ),
      );
      console.log(
        `User created successfully: ${user.email} with ID: ${user.id}, tenant creation requested for ${tenantId}`,
      );
      return {
        message:
          'Registration successful. Tenant provisioning in progress. You can log in after approval.',
        userId: user.id,
        email: user.email,
      };
    } catch (error) {
      console.error(
        `Registration error for ${email} at 01:50 AM +05, Tuesday, August 12, 2025:`,
        error.message,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Registration failed');
    }
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<TokenPair> {
    const { refreshToken } = refreshTokenDto;
    try {
      console.log(
        `Refresh token attempt with token: ${refreshToken.substring(0, 20)}...`,
      );
      const payload = this.jwtService.verifyRefreshToken(refreshToken);
      console.log(`Token payload:`, {
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        type: payload.type,
      });
      const user = await this.userService.findByEmail(payload.sub);
      if (!user) {
        console.log(`User not found for email: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }
      if (!user.isActive) {
        console.log(`User is not active: ${payload.sub}`);
        throw new UnauthorizedException('User not found or inactive');
      }
      console.log(`User found: ${user.email}, isActive: ${user.isActive}`);
      if (!this.jwtService.isRefreshTokenValid(refreshToken, user)) {
        console.log(`Invalid refresh token for user: ${user.email}`);
        throw new UnauthorizedException('Invalid refresh token');
      }
      console.log(
        `Generating new token pair for user: ${user.email}, tenant: ${payload.tenantId}, role: ${payload.role}`,
      );
      const newTokenPair = this.jwtService.generateTokenPair(
        user,
        payload.tenantId,
        payload.role,
      );
      console.log(`Refresh successful for user: ${user.email}`);
      return newTokenPair;
    } catch (error) {
      console.error(`Refresh token error:`, error.message);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      console.error(`Unexpected refresh error:`, error);
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const userRole = user.role || (user.isSuperuser ? 'ADMIN' : 'MANAGER');
    const authorities = ['ROLE_USER'];
    if (userRole === 'ADMIN' || user.isSuperuser) {
      authorities.push('ROLE_ADMIN');
    } else if (userRole === 'MANAGER') {
      authorities.push('ROLE_MANAGER');
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: userRole,
      isActive: user.isActive,
      isVerified: user.isVerified,
      isSuperuser: user.isSuperuser,
      authorities,
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    console.log(`User ${userId} logged out`);
    return { message: 'Logged out successfully' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string,
  ): Promise<void> {
    await this.userService.changePassword(userId, {
      currentPassword,
      newPassword,
      newPasswordConfirm,
    });
  }

  validatePasswordStrength(password: string): void {
    const minLength = 8;
    if (password.length < minLength) {
      throw new BadRequestException(
        `Password must be at least ${minLength} characters long`,
      );
    }
    if (!password.match(/\d/)) {
      throw new BadRequestException('Password must contain at least one digit');
    }
    if (!password.match(/[A-Z]/)) {
      throw new BadRequestException(
        'Password must contain at least one uppercase letter',
      );
    }
    if (!password.match(/[a-z]/)) {
      throw new BadRequestException(
        'Password must contain at least one lowercase letter',
      );
    }
    if (!password.match(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/)) {
      throw new BadRequestException(
        'Password must contain at least one special character',
      );
    }
  }
}
