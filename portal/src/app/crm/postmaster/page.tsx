'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchVerifiedDomains,
  fetchSnapshotHistory,
  triggerPostmasterSync,
  PostmasterSnapshot,
} from '@/lib/crm/postmaster';
import { PostmasterDashboard } from '@/components/crm/email/deliverability/PostmasterDashboard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

type DayRange = '7' | '30' | '90';

export default function PostmasterPage() {
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [dayRange, setDayRange] = useState<DayRange>('7');
  const [snapshots, setSnapshots] = useState<PostmasterSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadDomains();
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      loadSnapshots();
    }
  }, [selectedDomain, dayRange]);

  const loadDomains = async () => {
    try {
      setIsLoading(true);
      const domainList = await fetchVerifiedDomains();
      setDomains(domainList);
      if (domainList.length > 0) {
        setSelectedDomain(domainList[0]);
      }
    } catch (error) {
      console.error('Failed to load domains:', error);
      toast.error('Failed to load verified domains');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSnapshots = async () => {
    if (!selectedDomain) return;
    try {
      setIsLoading(true);
      const data = await fetchSnapshotHistory(selectedDomain, parseInt(dayRange));
      setSnapshots(data);
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      toast.error('Failed to load domain data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await triggerPostmasterSync();
      toast.success('Sync completed successfully');
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to sync:', error);
      toast.error('Failed to sync data');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading && domains.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Deliverability</h2>
          <p className="text-sm text-gray-500">
            Domain reputation, spam rate, and delivery health
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-gray-500">Loading domains...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Deliverability</h2>
          <p className="text-sm text-gray-500">
            Domain reputation, spam rate, and delivery health
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-gray-500">No domains configured</p>
              <p className="text-sm text-gray-400 mt-2">
                Go to Settings → Integrations → Google Postmaster Tools to connect and add domains
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Deliverability</h2>
        <p className="text-sm text-gray-500">
          Domain reputation, spam rate, and delivery health
        </p>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium block mb-2">Domain</label>
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger>
              <SelectValue placeholder="Select a domain" />
            </SelectTrigger>
            <SelectContent>
              {domains.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium block mb-2">Time Period</label>
          <Select value={dayRange} onValueChange={(v) => setDayRange(v as DayRange)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-gray-500">Loading data...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <PostmasterDashboard snapshots={snapshots} domain={selectedDomain} />
      )}
    </div>
  );
}
