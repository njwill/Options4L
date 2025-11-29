import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Home, Mail, Link2 } from 'lucide-react';

interface EmailVerifyProps {
  token: string;
  isLinking?: boolean;
  onComplete: () => void;
}

export function EmailVerify({ token, isLinking = false, onComplete }: EmailVerifyProps) {
  const { loginWithEmail, refreshUser, user, isLoading } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('Successfully signed in!');
  const verificationAttemptedRef = useRef(false);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage('No verification token provided.');
        return;
      }

      // Prevent duplicate verification attempts
      if (verificationAttemptedRef.current) {
        return;
      }

      // For linking flow, wait for auth to finish loading
      if (isLinking && isLoading) {
        return;
      }

      // Mark as attempted before making the request
      verificationAttemptedRef.current = true;

      try {
        if (isLinking && user) {
          // Linking flow - must be logged in
          const res = await fetch('/api/auth/link/email/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            credentials: 'include',
          });
          
          const data = await res.json();
          
          if (!res.ok) {
            throw new Error(data.error || 'Failed to link email');
          }
          
          await refreshUser();
          setSuccessMessage('Email linked successfully!');
        } else if (isLinking && !user) {
          // Linking flow but user not logged in - this is an error
          throw new Error('You must be logged in to link an email address.');
        } else {
          // Regular login flow
          await loginWithEmail(token);
          setSuccessMessage('Successfully signed in!');
        }
        
        setStatus('success');
        
        // Auto-redirect after successful verification
        setTimeout(() => {
          onComplete();
        }, 2000);
      } catch (err) {
        console.error('Email verification error:', err);
        setStatus('error');
        setErrorMessage(
          err instanceof Error 
            ? err.message 
            : isLinking 
              ? 'Failed to link email. The link may have expired.'
              : 'Failed to verify login link. It may have expired.'
        );
      }
    };

    verifyToken();
  }, [token, isLinking, isLoading, loginWithEmail, refreshUser, user, onComplete]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            <Mail className="w-6 h-6" />
            Email Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'verifying' && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription className="text-sm">
                Verifying your login link...
              </AlertDescription>
            </Alert>
          )}

          {status === 'success' && (
            <>
              <Alert className="border-primary/50 bg-primary/5">
                {isLinking ? (
                  <Link2 className="h-4 w-4 text-primary" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-primary" />
                )}
                <AlertDescription className="text-sm">
                  <span className="font-medium">{successMessage}</span> Redirecting you to the app...
                </AlertDescription>
              </Alert>

              <Button 
                onClick={onComplete}
                className="w-full"
                data-testid="button-continue"
              >
                <Home className="w-4 h-4 mr-2" />
                Continue to App
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  Login links expire after 15 minutes. Please request a new one.
                </p>

                <Button 
                  onClick={onComplete}
                  variant="outline"
                  className="w-full"
                  data-testid="button-go-home"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go to Home
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
