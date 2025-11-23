import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, Save, Clock, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface UserProfile {
  id: string;
  nostrPubkey: string;
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

export default function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  const npub = profile?.nostrPubkey ? `npub${profile.nostrPubkey.slice(0, 8)}...${profile.nostrPubkey.slice(-8)}` : '';

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="page-account-settings">
      {/* Profile Information */}
      <Card data-testid="card-profile">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nostr-pubkey">NOSTR Public Key</Label>
            <Input
              id="nostr-pubkey"
              value={npub}
              readOnly
              data-testid="input-nostr-pubkey"
              className="font-mono text-sm"
            />
          </div>

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
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {format(new Date(upload.uploadedAt), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
