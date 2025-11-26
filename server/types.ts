import type { AuthUser } from './auth';

declare global {
  namespace Express {
    interface User {
      id?: string;
      nostrPubkey?: string;
      displayName?: string | null;
      email?: string | null;
      profileImageUrl?: string | null;
      claims?: {
        sub: string;
        email?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        profile_image_url?: string | null;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }
    interface Request {
      user?: User | AuthUser;
    }
  }
}

export {};
