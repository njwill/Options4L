import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Home, Mail } from 'lucide-react';

interface EmailVerifyProps {
  token: string;
  onComplete: () => void;
}

export function EmailVerify({ token, onComplete }: EmailVerifyProps) {
  const { loginWithEmail } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage('No verification token provided.');
        return;
      }

      try {
        await loginWithEmail(token);
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
            : 'Failed to verify login link. It may have expired.'
        );
      }
    };

    verifyToken();
  }, [token, loginWithEmail, onComplete]);

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
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <span className="font-medium">Successfully signed in!</span> Redirecting you to the app...
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
