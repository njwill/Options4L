import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Save, 
  MessageSquare, 
  TrendingUp, 
  Layers, 
  History, 
  Shield,
  Sparkles,
  Clock,
  Gift
} from 'lucide-react';

interface SignupPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignUp: () => void;
}

const benefits = [
  {
    icon: Save,
    title: 'Save Your Data',
    description: 'Keep your trading analysis safe and accessible anytime'
  },
  {
    icon: MessageSquare,
    title: 'Add Notes',
    description: 'Write notes on transactions and positions for future reference'
  },
  {
    icon: TrendingUp,
    title: 'Live Pricing & Greeks',
    description: 'Get real-time options prices, IV, and Greeks calculations'
  },
  {
    icon: Layers,
    title: 'Group Positions',
    description: 'Organize related positions together for better analysis'
  },
  {
    icon: History,
    title: 'Upload History',
    description: 'Track all your file uploads and easily manage your data'
  },
  {
    icon: Shield,
    title: 'Smart Deduplication',
    description: 'Upload the same file twice? We handle duplicates automatically'
  }
];

export function SignupPromptModal({ open, onOpenChange, onSignUp }: SignupPromptModalProps) {
  const handleSignUp = () => {
    onOpenChange(false);
    onSignUp();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-signup-prompt">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Unlock Full Features</DialogTitle>
              <DialogDescription className="text-sm">
                Create a free account to save your analysis
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-3">
            {benefits.map((benefit, index) => (
              <div 
                key={index} 
                className="flex items-start gap-3 p-2 rounded-md"
                data-testid={`benefit-item-${index}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <benefit.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">{benefit.title}</p>
                  <p className="text-xs text-muted-foreground">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">Limited Time Offer</span>
            </div>
            <p className="text-sm">
              <span className="font-bold">FREE for the first 100 signups!</span>
              {' '}We're launching a monthly subscription soon, but early users get lifetime free access.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Sign up now to lock in free access forever</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button 
            onClick={handleSignUp} 
            className="w-full"
            data-testid="button-signup-prompt-cta"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Create Free Account
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground"
            data-testid="button-signup-prompt-dismiss"
          >
            Maybe Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
