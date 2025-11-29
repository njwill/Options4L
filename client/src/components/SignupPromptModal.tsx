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
  Gift
} from 'lucide-react';

interface SignupPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignUp: () => void;
}

const benefits = [
  { icon: Save, title: 'Save data permanently' },
  { icon: MessageSquare, title: 'Add notes' },
  { icon: TrendingUp, title: 'Live pricing & Greeks' },
  { icon: Layers, title: 'Group positions' },
  { icon: History, title: 'Upload history' },
  { icon: Shield, title: 'Smart deduplication' }
];

export function SignupPromptModal({ open, onOpenChange, onSignUp }: SignupPromptModalProps) {
  const handleSignUp = () => {
    onOpenChange(false);
    onSignUp();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-signup-prompt">
        <DialogHeader className="space-y-1 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>Unlock Full Features</DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            Create a free account to save your analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {benefits.map((benefit, index) => (
              <div 
                key={index} 
                className="flex items-center gap-2"
                data-testid={`benefit-item-${index}`}
              >
                <benefit.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm">{benefit.title}</span>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm">
                <span className="font-semibold text-primary">FREE for the first 100 signups!</span>
                {' '}Monthly subscription coming soon.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col pt-2">
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
            size="sm"
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
