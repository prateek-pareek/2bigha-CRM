'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchPostmasterConfig,
  fetchAuthorizeUrl,
  updateMonitoredDomains,
  disconnectPostmaster,
  triggerPostmasterSync,
  PostmasterConnectionStatus,
} from '@/lib/crm/postmaster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PostmasterIntegrationPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<PostmasterConnectionStatus | null>(null);
  const [domains, setDomains] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  useEffect(() => {
    loadConfig();

    const oauthParam = searchParams.get('postmaster_oauth');
    if (oauthParam === 'success') {
      toast.success('Successfully connected to Google Postmaster Tools!');
    } else if (oauthParam === 'error') {
      const reason = searchParams.get('reason');
      toast.error(`Connection failed: ${reason || 'Unknown error'}`);
    }
  }, [searchParams]);

  const loadConfig = async () => {
    try {
      setIsLoadingConfig(true);
      const config = await fetchPostmasterConfig();
      setStatus(config);
      if (config.monitoredDomains?.length) {
        setDomains(config.monitoredDomains.join(', '));
      }
    } catch (error) {
      console.error('Failed to load Postmaster config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleConnect = async () => {
    try {
      const { authorizeUrl } = await fetchAuthorizeUrl();
      window.location.href = authorizeUrl;
    } catch (error) {
      console.error('Failed to get authorize URL:', error);
      toast.error('Failed to initiate connection');
    }
  };

  const handleSaveDomains = async () => {
    try {
      setIsSaving(true);
      const domainList = domains
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d);

      if (domainList.length === 0) {
        toast.error('Please enter at least one domain');
        return;
      }

      await updateMonitoredDomains(domainList);
      setStatus((prev) =>
        prev ? { ...prev, monitoredDomains: domainList } : null,
      );
      toast.success('Domains updated successfully');
    } catch (error) {
      console.error('Failed to update domains:', error);
      toast.error('Failed to update domains');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await triggerPostmasterSync();
      toast.success('Sync completed successfully');
      // Reload config to show updated last sync time
      await loadConfig();
    } catch (error) {
      console.error('Failed to sync:', error);
      toast.error('Failed to sync data');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect Google Postmaster Tools? This will stop monitoring your domains.',
      )
    ) {
      return;
    }

    try {
      await disconnectPostmaster();
      setStatus(null);
      setDomains('');
      toast.success('Disconnected successfully');
      await loadConfig();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect');
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Google Postmaster Tools</h2>
        <p className="text-sm text-gray-500">
          Monitor domain reputation, spam rates, and delivery errors from Google's perspective
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
          <CardDescription>Manage your Postmaster Tools integration</CardDescription>
        </CardHeader>
        <CardContent>
          {!status?.isActive || !status?.hasRefreshToken ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Connect your Google account to start monitoring your email sending domains. This
                  requires access to Google Postmaster Tools.
                </p>
              </div>
              <Button onClick={handleConnect} className="w-full">
                Connect with Google
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-green-900">Connected</p>
                  <p className="text-xs text-green-700 mt-1">{status.connectedEmail}</p>
                </div>
                <Badge variant="outline" className="bg-green-100">
                  Active
                </Badge>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-2">Monitored Domains</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Enter comma-separated domain names (e.g., example.com, mail.example.com)
                  </p>
                  <Input
                    placeholder="example.com, mail.example.com"
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleSaveDomains}
                  disabled={isSaving}
                  variant="outline"
                  className="w-full"
                >
                  {isSaving ? 'Saving...' : 'Save Domains'}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSync}
                  disabled={isSyncing}
                  variant="outline"
                  className="flex-1"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
                <Button
                  onClick={handleDisconnect}
                  variant="destructive"
                  className="flex-1"
                >
                  Disconnect
                </Button>
              </div>

              {status.accessTokenExpiresAt && (
                <p className="text-xs text-gray-500 text-center pt-2">
                  Token expires: {new Date(status.accessTokenExpiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>Setup instructions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <h4 className="font-medium mb-1">Prerequisites</h4>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Access to Google Postmaster Tools (postmaster.google.com)</li>
              <li>Domain ownership verified in Postmaster Tools</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-1">Steps</h4>
            <ol className="list-decimal list-inside text-gray-600 space-y-1">
              <li>Click "Connect with Google" above</li>
              <li>Authorize access to Postmaster Tools</li>
              <li>Enter your monitored domain names</li>
              <li>Click "Sync Now" to fetch the latest data</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
