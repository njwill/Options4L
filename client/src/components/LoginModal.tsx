import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Key, AlertCircle, ExternalLink, CheckCircle, Mail, ArrowLeft, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
    };
  }
}

type AuthMethod = 'nostr' | 'email';
type EmailStep = 'input' | 'sent';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { login, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNostrExtension, setHasNostrExtension] = useState(false);
  const [isCheckingExtension, setIsCheckingExtension] = useState(true);
  const [activeTab, setActiveTab] = useState<AuthMethod>('nostr');
  
  // Email-specific state
  const [email, setEmail] = useState('');
  const [emailStep, setEmailStep] = useState<EmailStep>('input');
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  // Check if email authentication is configured
  useEffect(() => {
    if (!open) return;
    
    const checkEmailStatus = async () => {
      try {
        const response = await fetch('/api/auth/email/status', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setEmailConfigured(data.configured);
        }
      } catch (err) {
        console.error('Failed to check email status:', err);
        setEmailConfigured(false);
      }
    };
    
    checkEmailStatus();
  }, [open]);

  const checkNostrExtension = useCallback(() => {
    const hasExtension = typeof window !== 'undefined' && typeof window.nostr !== 'undefined' && window.nostr !== null;
    setHasNostrExtension(hasExtension);
    return hasExtension;
  }, []);

  useEffect(() => {
    if (!open) return;

    setIsCheckingExtension(true);
    
    const checkWithRetry = async () => {
      const delays = [0, 100, 300, 500, 1000, 2000];
      
      for (const delay of delays) {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        if (checkNostrExtension()) {
          setIsCheckingExtension(false);
          return;
        }
      }
      
      setIsCheckingExtension(false);
    };

    checkWithRetry();

    const interval = setInterval(() => {
      if (checkNostrExtension()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [open, checkNostrExtension]);

  const handleNostrLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!window.nostr) {
        setError('NOSTR extension not detected. Please install a NIP-07 extension like nos2x or Alby.');
        setIsLoading(false);
        return;
      }

      const pubkey = await window.nostr.getPublicKey();

      const challengeResponse = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey }),
      });

      if (!challengeResponse.ok) {
        throw new Error('Failed to get authentication challenge');
      }

      const { nonce } = await challengeResponse.json();

      const event = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', nonce]],
        content: nonce,
      };

      const signedEvent = await window.nostr.signEvent(event);

      await login(signedEvent);

      onOpenChange(false);
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send login email');
      }

      // Move to "email sent" step
      setEmailStep('sent');
    } catch (err) {
      console.error('Email request error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send login email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setError(null);
      setEmail('');
      setEmailStep('input');
    }
    onOpenChange(newOpen);
  };

  const handleBackToEmailInput = () => {
    setEmailStep('input');
    setError(null);
  };

  // Development-only instant login (bypasses magic link)
  const handleDevLogin = async () => {
    if (!import.meta.env.DEV) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'test@test.com' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Dev login failed');
      }

      // Refresh user from server (cookie was already set by dev-login endpoint)
      await refreshUser();
      onOpenChange(false);
    } catch (err) {
      console.error('Dev login error:', err);
      setError(err instanceof Error ? err.message : 'Dev login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-login">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            Sign In
          </DialogTitle>
          <DialogDescription>
            Sign in to save your analysis history and access it from any device.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AuthMethod)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="nostr" data-testid="tab-nostr" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              NOSTR
            </TabsTrigger>
            <TabsTrigger 
              value="email" 
              data-testid="tab-email" 
              className="flex items-center gap-2"
              disabled={emailConfigured === false}
            >
              <Mail className="w-4 h-4" />
              Email
            </TabsTrigger>
          </TabsList>

          {/* NOSTR Tab */}
          <TabsContent value="nostr" className="space-y-4 mt-4">
            {isCheckingExtension && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription className="text-sm">
                  Detecting NOSTR extension...
                </AlertDescription>
              </Alert>
            )}

            {!isCheckingExtension && !hasNostrExtension && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p className="text-sm">
                    You'll need a NOSTR browser extension to sign in. We recommend:
                  </p>
                  <div className="flex flex-col gap-2 text-sm">
                    <a 
                      href="https://github.com/fiatjaf/nos2x" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                      data-testid="link-nos2x"
                    >
                      nos2x (Chrome/Firefox)
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a 
                      href="https://getalby.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                      data-testid="link-alby"
                    >
                      Alby (Chrome/Firefox)
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    If you have an extension installed, try refreshing the page.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {!isCheckingExtension && hasNostrExtension && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  NOSTR extension detected! Click below to sign in securely.
                </AlertDescription>
              </Alert>
            )}

            {activeTab === 'nostr' && error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <Button
                onClick={handleNostrLogin}
                disabled={isLoading || isCheckingExtension || !hasNostrExtension}
                className="w-full"
                data-testid="button-nostr-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4 mr-2" />
                    Sign in with NOSTR
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Your NOSTR keys never leave your device. We only verify your signature.
              </p>
            </div>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4 mt-4">
            {emailStep === 'input' ? (
              <>
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    We'll send you a secure login link. No password needed!
                  </AlertDescription>
                </Alert>

                {activeTab === 'email' && error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleEmailRequest} className="space-y-3">
                  <Input
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    data-testid="input-email"
                  />

                  <Button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full"
                    data-testid="button-email-request"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Login Link
                      </>
                    )}
                  </Button>
                </form>

                <p className="text-xs text-muted-foreground text-center">
                  The link expires in 15 minutes.
                </p>

                {/* Development-only instant login button */}
                {import.meta.env.DEV && (
                  <div className="pt-4 border-t border-dashed">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDevLogin}
                      disabled={isLoading}
                      className="w-full border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10"
                      data-testid="button-dev-login"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Dev Login (test@test.com)
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-yellow-600/70 text-center mt-1">
                      Development only - bypasses email verification
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <Alert className="border-primary/50 bg-primary/5">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium">Check your inbox!</span> We sent a login link to{' '}
                    <span className="font-medium">{email}</span>
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Click the link in your email to complete sign in. You can close this window.
                  </p>

                  <Button
                    variant="outline"
                    onClick={handleBackToEmailInput}
                    className="w-full"
                    data-testid="button-back-to-email"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Use a different email
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Didn't receive it? Check your spam folder or try again in a few minutes.
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
