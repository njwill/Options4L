import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// In-memory nonce store (in production, use Redis)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Date.now();
  Array.from(nonceStore.entries()).forEach(([key, value]) => {
    if (value.expiresAt < now) {
      nonceStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

export interface AuthUser {
  id: string;
  nostrPubkey: string | null;
  email: string | null;
  displayName: string | null;
}

// Use SESSION_SECRET if available, otherwise generate a random secret for development
// In production, SESSION_SECRET should always be set
const JWT_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET or JWT_SECRET environment variable is required in production');
  }
  // Generate random secret for development
  const crypto = require('crypto');
  const secret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  Using randomly generated JWT secret for development. Set SESSION_SECRET or JWT_SECRET for production.');
  return secret;
})();

const JWT_EXPIRES_IN = '7d';

/**
 * Generate a random nonce for NOSTR authentication
 */
export function generateNonce(): string {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  
  nonceStore.set(nonce, { nonce, expiresAt });
  return nonce;
}

/**
 * Verify a NOSTR nonce exists and hasn't expired
 */
export function verifyNonce(nonce: string): boolean {
  const stored = nonceStore.get(nonce);
  if (!stored) return false;
  if (stored.expiresAt < Date.now()) {
    nonceStore.delete(nonce);
    return false;
  }
  // Consume the nonce (one-time use)
  nonceStore.delete(nonce);
  return true;
}

/**
 * Verify NOSTR signature
 * The client sends a signed event with the nonce in the content
 */
export function verifyNostrSignature(event: NostrEvent, expectedNonce: string): boolean {
  // Verify event signature is valid
  if (!verifyEvent(event)) {
    return false;
  }
  
  // Verify the event content contains the nonce
  if (event.content !== expectedNonce) {
    return false;
  }
  
  // Verify event kind is correct (kind 27235 is commonly used for auth)
  if (event.kind !== 27235) {
    return false;
  }
  
  return true;
}

/**
 * Find or create user by NOSTR public key
 */
export async function findOrCreateUser(nostrPubkey: string): Promise<AuthUser> {
  // Try to find existing user
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.nostrPubkey, nostrPubkey))
    .limit(1);
  
  if (existingUsers.length > 0) {
    const user = existingUsers[0];
    // Update last login time
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    
    return {
      id: user.id,
      nostrPubkey: user.nostrPubkey,
      email: user.email,
      displayName: user.displayName,
    };
  }
  
  // Create new user
  const newUsers = await db
    .insert(users)
    .values({
      nostrPubkey,
      lastLoginAt: new Date(),
    })
    .returning();
  
  const newUser = newUsers[0];
  return {
    id: newUser.id,
    nostrPubkey: newUser.nostrPubkey,
    email: newUser.email,
    displayName: newUser.displayName,
  };
}

/**
 * Generate JWT token for authenticated user
 */
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.id,
      nostrPubkey: user.nostrPubkey,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify JWT token and return user data
 */
export function verifyToken(token: string): { userId: string; nostrPubkey: string | null; email: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      nostrPubkey: string | null;
      email: string | null;
    };
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (!user) return null;
  
  return {
    id: user.id,
    nostrPubkey: user.nostrPubkey,
    email: user.email,
    displayName: user.displayName,
  };
}
