import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, Save, Clock, FileText, Trash2, Link2, Unlink, Check, Mail, Key, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hexToNpub, truncateNpub } from '@/lib/nostr';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UserProfile {
  id: string;
  nostrPubkey: string | null;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  transactionCount: number;
  uploadCount: number;
}

interface Upload {
  id: string;
  sourceFilename: string;
  transactionCount: number;
  uploadedAt: string;
}

interface AccountSettingsProps {
  onDataChange?: () => void;
}

export default function AccountSettings({ onDataChange }: AccountSettingsProps) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  
  // Account linking state
  const [isLinkingNostr, setIsLinkingNostr] = useState(false);
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [linkEmailInput, setLinkEmailInput] = useState('');
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [showLinkEmailDialog, setShowLinkEmailDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeConflictUserId, setMergeConflictUserId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  
  // Account unlinking state
  const [isUnlinkingNostr, setIsUnlinkingNostr] = useState(false);
  const [isUnlinkingEmail, setIsUnlinkingEmail] = useState(false);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setIsLoading(true);
      const [profileRes, uploadsRes] = await Promise.all([
        fetch('/api/user/profile', { credentials: 'include' }),
        fetch('/api/uploads', { credentials: 'include' }),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
        setDisplayName(data.profile.displayName || '');
      }

      if (uploadsRes.ok) {
        const data = await uploadsRes.json();
        setUploads(data.uploads);
      }
    } catch (error) {
      console.error('Failed to fetch profile data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profile data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDisplayName = async () => {
    try {
      setIsSaving(true);
      const response = await fetch('/api/user/display-name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Success',
          description: data.message,
        });
        fetchProfileData();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Failed to save display name:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save display name',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      const response = await fetch('/api/user/export', { credentials: 'include' });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'robinhood-trades-export.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: 'Success',
          description: 'Data exported successfully',
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      toast({
        title: 'Error',
        description: 'Failed to export data',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    try {
      setDeletingUploadId(uploadId);
      const response = await fetch(`/api/uploads/${uploadId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Deleted',
          description: data.message,
        });
        fetchProfileData();
        onDataChange?.();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Failed to delete upload:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete upload',
        variant: 'destructive',
      });
    } finally {
      setDeletingUploadId(null);
    }
  };

  // Link NOSTR account handler
  const handleLinkNostr = useCallback(async () => {
    if (!window.nostr) {
      toast({
        title: 'NOSTR Extension Required',
        description: 'Please install a NOSTR browser extension (nos2x, Alby, or Flamingo)',
        variant: 'destructive',
      });
      return;
    }

    setIsLinkingNostr(true);
    try {
      // Get a challenge from the server
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!challengeRes.ok) throw new Error('Failed to get challenge');
      const { nonce } = await challengeRes.json();

      // Sign the challenge with NOSTR
      const event = await window.nostr.signEvent({
        kind: 27235,
        content: nonce,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
      });

      // Send to link endpoint
      const linkRes = await fetch('/api/auth/link/nostr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
        credentials: 'include',
      });

      const data = await linkRes.json();

      if (linkRes.status === 409 && data.canMerge) {
        // Conflict - offer to merge accounts
        setMergeConflictUserId(data.conflictUserId);
        setShowMergeDialog(true);
        return;
      }

      if (!linkRes.ok) throw new Error(data.error || 'Failed to link NOSTR');

      toast({
        title: 'Success',
        description: 'NOSTR account linked successfully',
      });
      
      refreshUser();
      fetchProfileData();
    } catch (error) {
      console.error('Link NOSTR error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to link NOSTR account',
        variant: 'destructive',
      });
    } finally {
      setIsLinkingNostr(false);
    }
  }, [toast, refreshUser]);

  // Link email handler - send magic link
  const handleLinkEmailRequest = async () => {
    const email = linkEmailInput.trim().toLowerCase();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setIsLinkingEmail(true);
    try {
      const res = await fetch('/api/auth/link/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send verification email');

      setEmailLinkSent(true);
      toast({
        title: 'Verification Email Sent',
        description: `Check your inbox at ${email}`,
      });
    } catch (error) {
      console.error('Link email request error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send verification email',
        variant: 'destructive',
      });
    } finally {
      setIsLinkingEmail(false);
    }
  };

  // Merge accounts handler
  const handleMergeAccounts = async () => {
    if (!mergeConflictUserId) return;

    setIsMerging(true);
    try {
      const res = await fetch('/api/auth/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId: mergeConflictUserId }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to merge accounts');

      toast({
        title: 'Accounts Merged',
        description: `Successfully merged accounts. Transferred ${data.merged.transactions} transactions.`,
      });
      
      setShowMergeDialog(false);
      setMergeConflictUserId(null);
      refreshUser();
      fetchProfileData();
      onDataChange?.();
    } catch (error) {
      console.error('Merge accounts error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to merge accounts',
        variant: 'destructive',
      });
    } finally {
      setIsMerging(false);
    }
  };

  // Unlink NOSTR handler
  const handleUnlinkNostr = async () => {
    setIsUnlinkingNostr(true);
    try {
      const res = await fetch('/api/auth/unlink/nostr', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to unlink NOSTR');

      toast({
        title: 'NOSTR Unlinked',
        description: 'NOSTR authentication has been removed from your account.',
      });
      
      refreshUser();
      fetchProfileData();
    } catch (error) {
      console.error('Unlink NOSTR error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to unlink NOSTR',
        variant: 'destructive',
      });
    } finally {
      setIsUnlinkingNostr(false);
    }
  };

  // Unlink Email handler
  const handleUnlinkEmail = async () => {
    setIsUnlinkingEmail(true);
    try {
      const res = await fetch('/api/auth/unlink/email', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to unlink email');

      toast({
        title: 'Email Unlinked',
        description: 'Email authentication has been removed from your account.',
      });
      
      refreshUser();
      fetchProfileData();
    } catch (error) {
      console.error('Unlink email error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to unlink email',
        variant: 'destructive',
      });
    } finally {
      setIsUnlinkingEmail(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to view account settings</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  const npub = profile?.nostrPubkey ? truncateNpub(hexToNpub(profile.nostrPubkey)) : '';
  const hasNostr = !!profile?.nostrPubkey;
  const hasEmail = !!profile?.email;

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="page-account-settings">
      {/* Linked Accounts */}
      <Card data-testid="card-linked-accounts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Linked Accounts
          </CardTitle>
          <CardDescription>
            Connect multiple login methods to your account for easier access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* NOSTR Status */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="font-medium">NOSTR</div>
                {hasNostr ? (
                  <div className="text-sm text-muted-foreground font-mono">
                    {npub}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Not linked
                  </div>
                )}
              </div>
            </div>
            {hasNostr ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-primary">
                  <Check className="w-4 h-4" />
                  <span className="text-sm">Linked</span>
                </div>
                {hasEmail && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={isUnlinkingNostr}
                        data-testid="button-unlink-nostr"
                      >
                        {isUnlinkingNostr ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unlink className="w-4 h-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unlink NOSTR?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove NOSTR login from your account. You will still be able to log in with your email address.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUnlinkNostr}>
                          Unlink NOSTR
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                onClick={handleLinkNostr}
                disabled={isLinkingNostr}
                data-testid="button-link-nostr"
              >
                {isLinkingNostr ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Link NOSTR
              </Button>
            )}
          </div>

          {/* Email Status */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Email</div>
                {hasEmail ? (
                  <div className="text-sm text-muted-foreground">
                    {profile.email}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Not linked
                  </div>
                )}
              </div>
            </div>
            {hasEmail ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-primary">
                  <Check className="w-4 h-4" />
                  <span className="text-sm">Linked</span>
                </div>
                {hasNostr && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={isUnlinkingEmail}
                        data-testid="button-unlink-email"
                      >
                        {isUnlinkingEmail ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unlink className="w-4 h-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unlink Email?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove email login from your account. You will still be able to log in with NOSTR.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUnlinkEmail}>
                          Unlink Email
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setShowLinkEmailDialog(true)}
                data-testid="button-link-email"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Link Email
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile Information */}
      <Card data-testid="card-profile">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <div className="flex gap-2">
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter a display name"
                maxLength={100}
                data-testid="input-display-name"
              />
              <Button 
                onClick={handleSaveDisplayName} 
                disabled={isSaving || !displayName.trim()}
                data-testid="button-save-display-name"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <div className="text-sm text-muted-foreground">Total Transactions</div>
              <div className="text-2xl font-semibold" data-testid="text-transaction-count">
                {profile?.transactionCount || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Uploads</div>
              <div className="text-2xl font-semibold" data-testid="text-upload-count">
                {profile?.uploadCount || 0}
              </div>
            </div>
          </div>

          {profile?.createdAt && (
            <div className="text-sm text-muted-foreground pt-2">
              Member since {format(new Date(profile.createdAt), 'MMMM d, yyyy')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card data-testid="card-export">
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>Download all your transaction data as CSV</CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleExportData} 
            disabled={isExporting || !profile?.transactionCount}
            data-testid="button-export-data"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export All Transactions'}
          </Button>
        </CardContent>
      </Card>

      {/* Upload History */}
      <Card data-testid="card-upload-history">
        <CardHeader>
          <CardTitle>Upload History</CardTitle>
          <CardDescription>View your past file uploads</CardDescription>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-uploads">
              No uploads yet
            </div>
          ) : (
            <div className="space-y-2">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                  data-testid={`upload-item-${upload.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium" data-testid={`upload-filename-${upload.id}`}>
                        {upload.sourceFilename}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {upload.transactionCount} transactions
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {format(new Date(upload.uploadedAt), 'MMM d, yyyy h:mm a')}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingUploadId === upload.id}
                          data-testid={`button-delete-upload-${upload.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Upload</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{upload.sourceFilename}"? 
                            This will permanently remove {upload.transactionCount} transactions 
                            from your account. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteUpload(upload.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid={`button-confirm-delete-${upload.id}`}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Email Dialog */}
      <Dialog open={showLinkEmailDialog} onOpenChange={setShowLinkEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Email Address</DialogTitle>
            <DialogDescription>
              Add an email address to your account for an alternative login method.
            </DialogDescription>
          </DialogHeader>
          
          {!emailLinkSent ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="link-email">Email Address</Label>
                <Input
                  id="link-email"
                  type="email"
                  placeholder="you@example.com"
                  value={linkEmailInput}
                  onChange={(e) => setLinkEmailInput(e.target.value)}
                  data-testid="input-link-email"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLinkEmailDialog(false);
                    setLinkEmailInput('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleLinkEmailRequest}
                  disabled={isLinkingEmail || !linkEmailInput.trim()}
                  data-testid="button-send-link-email"
                >
                  {isLinkingEmail ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Send Verification Link
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-md">
                <Check className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-medium">Verification email sent!</div>
                  <div className="text-sm text-muted-foreground">
                    Check your inbox and click the link to complete linking.
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setShowLinkEmailDialog(false);
                    setEmailLinkSent(false);
                    setLinkEmailInput('');
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Accounts Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Already Exists</DialogTitle>
            <DialogDescription>
              This login method is already linked to a different account. Would you like to merge the accounts?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="p-4 bg-muted/50 rounded-md space-y-2">
              <div className="font-medium">What happens when you merge:</div>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>All transactions from the other account will be moved here</li>
                <li>All comments and uploads will be transferred</li>
                <li>The other account will be deleted</li>
                <li>You can then login with either method</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMergeDialog(false);
                setMergeConflictUserId(null);
              }}
              disabled={isMerging}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMergeAccounts}
              disabled={isMerging}
              data-testid="button-merge-accounts"
            >
              {isMerging ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              Merge Accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
