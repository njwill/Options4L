import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Key, AlertCircle, ExternalLink, CheckCircle } from 'lucide-react';
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

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNostrExtension, setHasNostrExtension] = useState(false);

  const checkNostrExtension = () => {
    const hasExtension = typeof window.nostr !== 'undefined';
    setHasNostrExtension(hasExtension);
    return hasExtension;
  };

  const handleLogin = async () => {
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

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      checkNostrExtension();
    } else {
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-login">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            Sign in with NOSTR
          </DialogTitle>
          <DialogDescription>
            Sign in to save your analysis history and access it from any device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!hasNostrExtension && open && (
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
              </AlertDescription>
            </Alert>
          )}

          {hasNostrExtension && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                NOSTR extension detected! Click below to sign in securely.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <Button
              onClick={handleLogin}
              disabled={isLoading || !hasNostrExtension}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
