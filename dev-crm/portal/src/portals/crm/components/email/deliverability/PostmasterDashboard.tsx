import { PostmasterSnapshot } from '@/lib/crm/postmaster';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PostmasterDashboardProps {
  snapshots: PostmasterSnapshot[];
  domain: string;
}

export function PostmasterDashboard({
  snapshots,
  domain,
}: PostmasterDashboardProps) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <p className="text-gray-500">
              No data available for {domain}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Google Postmaster Tools data has a 24-hour delay. Click Sync Now to fetch the latest.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const latest = snapshots[0];

  const getReputationColor = (reputation: string) => {
    switch (reputation) {
      case 'HIGH':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'BAD':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const percentFormat = (ratio: number) => {
    return `${Math.round(ratio * 100)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{domain}</h3>
          <p className="text-sm text-gray-500">
            Last updated: {new Date(latest.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge className={`px-4 py-2 text-lg font-bold border ${getReputationColor(
          latest.domainReputation,
        )}`}>
          {latest.domainReputation || 'UNKNOWN'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spam Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {percentFormat(latest.userReportedSpamRatio)}
            </div>
            <p className="text-xs text-gray-500 mt-1">User reported spam</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">SPF Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {percentFormat(latest.spfSuccessRatio)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Authentication passing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">DKIM Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {percentFormat(latest.dkimSuccessRatio)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Authentication passing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">DMARC Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {percentFormat(latest.dmarcSuccessRatio)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Authentication passing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inbound Encryption</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {percentFormat(latest.inboundEncryptionRatio)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Messages encrypted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outbound Encryption</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {percentFormat(latest.outboundEncryptionRatio)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Messages encrypted</p>
          </CardContent>
        </Card>
      </div>

      {latest.deliveryErrors && latest.deliveryErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Errors</CardTitle>
            <CardDescription>Top issues affecting deliverability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {latest.deliveryErrors
                .sort((a, b) => (b.errorRatio || 0) - (a.errorRatio || 0))
                .slice(0, 5)
                .map((error, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">{error.errorType}</p>
                      <p className="text-xs text-gray-500">{error.errorClass}</p>
                    </div>
                    <Badge variant="outline">
                      {percentFormat(error.errorRatio || 0)}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {latest.ipReputations && latest.ipReputations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">IP Reputation</CardTitle>
            <CardDescription>Reputation status of sending IPs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {latest.ipReputations
                .slice(0, 5)
                .map((ip, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">{ip.reputation}</p>
                      <p className="text-xs text-gray-500">
                        {ip.numIps || 0} IP{(ip.numIps || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {snapshots.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <CardDescription>Data for selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              Showing {snapshots.length} days of historical data
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
