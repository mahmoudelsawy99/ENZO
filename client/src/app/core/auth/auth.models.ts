export interface ApiResponse<T> {
  data: T;
}

export interface ApiMessage {
  message: string;
}

export type UserType = 'SUPER_ADMIN' | 'TENANT_USER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  userType: UserType;
  tenantId: string | null;
  status: UserStatus;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
}

export interface SessionData {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
}
