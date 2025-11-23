import { Router, type Request, Response } from 'express';
import { type Event as NostrEvent } from 'nostr-tools';
import {
  generateNonce,
  verifyNonce,
  verifyNostrSignature,
  findOrCreateUser,
  generateToken,
} from './auth';
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

export default router;
