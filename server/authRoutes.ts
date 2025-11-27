import { Router, type Request, Response } from 'express';
import { type Event as NostrEvent } from 'nostr-tools';
import {
  generateNonce,
  verifyNonce,
  verifyNostrSignature,
  findOrCreateUser,
  generateToken,
  getUserById,
  type AuthUser,
} from './auth';
import {
  createEmailVerificationToken,
  verifyEmailToken,
  findOrCreateUserByEmail,
  checkEmailRateLimit,
} from './storage';
import { sendMagicLinkEmail, isEmailConfigured } from './emailService';
import './types';

const router = Router();

/**
 * POST /api/auth/challenge
 * Generate a nonce for the client to sign
 */
router.post('/challenge', async (req: Request, res: Response) => {
  try {
    const nonce = generateNonce();
    res.json({ nonce });
  } catch (error) {
    console.error('Challenge generation error:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
});

/**
 * POST /api/auth/login
 * Verify NOSTR signature and create session
 * 
 * Body: {
 *   event: NostrEvent (signed event with nonce in content)
 * }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { event } = req.body as { event: NostrEvent };
    
    if (!event) {
      return res.status(400).json({ error: 'Event is required' });
    }
    
    const nonce = event.content;
    
    // Verify nonce is valid and hasn't expired
    if (!verifyNonce(nonce)) {
      return res.status(401).json({ error: 'Invalid or expired nonce' });
    }
    
    // Verify NOSTR signature
    if (!verifyNostrSignature(event, nonce)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Find or create user
    const user = await findOrCreateUser(event.pubkey);
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Set httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        nostrPubkey: user.nostrPubkey,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 * Clear session cookie
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    res.clearCookie('auth_token');
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info from session
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    res.json({
      user: req.user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================================================
// Email Authentication Routes
// ============================================================================

/**
 * GET /api/auth/email/status
 * Check if email authentication is configured
 */
router.get('/email/status', async (req: Request, res: Response) => {
  try {
    res.json({ 
      configured: isEmailConfigured(),
    });
  } catch (error) {
    console.error('Email status check error:', error);
    res.status(500).json({ error: 'Failed to check email status' });
  }
});

/**
 * POST /api/auth/email/request
 * Request a magic link to be sent to email
 * 
 * Body: {
 *   email: string
 * }
 */
router.post('/email/request', async (req: Request, res: Response) => {
  try {
    const { email: rawEmail } = req.body as { email: string };
    
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Normalize and validate email
    const email = rawEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check if email is configured
    if (!isEmailConfigured()) {
      return res.status(503).json({ 
        error: 'Email authentication is not configured. Please use NOSTR authentication or contact the administrator.' 
      });
    }
    
    // Check rate limit
    const withinLimit = await checkEmailRateLimit(email);
    if (!withinLimit) {
      return res.status(429).json({ 
        error: 'Too many login attempts. Please wait before trying again.' 
      });
    }
    
    // Create verification token
    const token = await createEmailVerificationToken(email);
    
    // Build magic link URL
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const magicLink = `${baseUrl}/auth/verify?token=${token}`;
    
    // Send email
    const sent = await sendMagicLinkEmail(email, magicLink);
    
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send login email. Please try again.' });
    }
    
    res.json({ 
      success: true, 
      message: 'Login link sent! Check your email inbox.' 
    });
  } catch (error) {
    console.error('Email request error:', error);
    res.status(500).json({ error: 'Failed to send login email' });
  }
});

/**
 * POST /api/auth/email/verify
 * Verify magic link token and create session
 * 
 * Body: {
 *   token: string
 * }
 */
router.post('/email/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token: string };
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    // Verify token and get email
    const email = await verifyEmailToken(token);
    
    if (!email) {
      return res.status(401).json({ 
        error: 'Invalid or expired link. Please request a new login link.' 
      });
    }
    
    // Find or create user by email
    const dbUser = await findOrCreateUserByEmail(email);
    
    // Convert to AuthUser format
    const authUser: AuthUser = {
      id: dbUser.id,
      nostrPubkey: dbUser.nostrPubkey,
      email: dbUser.email,
      displayName: dbUser.displayName,
    };
    
    // Generate JWT token
    const jwtToken = generateToken(authUser);
    
    // Set httpOnly cookie
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.json({
      success: true,
      user: {
        id: authUser.id,
        nostrPubkey: authUser.nostrPubkey,
        email: authUser.email,
        displayName: authUser.displayName,
      },
    });
  } catch (error) {
    console.error('Email verify error:', error);
    res.status(500).json({ error: 'Failed to verify login link' });
  }
});

export default router;
