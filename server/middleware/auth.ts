import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import '../types';

/**
 * Middleware to optionally authenticate user from JWT cookie
 * Does not block request if no auth token present
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.auth_token;
    
    if (!token) {
      return next();
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      // Invalid token, clear it
      res.clearCookie('auth_token');
      return next();
    }
    
    // Fetch user from database
    const userResults = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);
    
    if (userResults.length > 0) {
      const user = userResults[0];
      req.user = {
        id: user.id,
        nostrPubkey: user.nostrPubkey,
        email: user.email,
        displayName: user.displayName,
      };
    }
    
    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
}

/**
 * Middleware to require authentication
 * Blocks request if no valid auth token present
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.auth_token;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.clearCookie('auth_token');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Fetch user from database
    const userResults = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);
    
    if (userResults.length === 0) {
      res.clearCookie('auth_token');
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = userResults[0];
    req.user = {
      id: user.id,
      nostrPubkey: user.nostrPubkey,
      email: user.email,
      displayName: user.displayName,
    };
    
    next();
  } catch (error) {
    console.error('Require auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}
