
import React, { useEffect, useState } from 'react';
import { Computer, Server, RefreshCw, AlertCircle, Zap, Clock, Ban, ExternalLink, AlertTriangle, Sparkles, Globe, Wifi, History, BarChart } from 'lucide-react';
import { useLatencyTest } from '@/hooks/blockchain/useLatencyTest';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { formatTimeDiff } from '@/lib/api';

interface LatencyTestProps {
  networkId: string;
  networkName: string;
}

const LatencyTest: React.FC<LatencyTestProps> = ({ networkId, networkName }) => {
  const { results, isRunning, geoInfo, runLatencyTest, hasRun } = useLatencyTest(networkId);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  
  // Check when the latency data was last updated
  useEffect(() => {
    const storedData = localStorage.getItem(`latency-results-${networkId}`);
    if (storedData && hasRun) {
      try {
        const parsedData = JSON.parse(storedData);
        const timestamp = parsedData.timestamp;
        if (timestamp) {
          const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
          setLastUpdated(formatTimeDiff(secondsAgo));
        }
      } catch (e) {
        console.error('Error parsing timestamp:', e);
      }
    }
  }, [networkId, hasRun, results]);
  
  // Format latency display
  const formatLatency = (result: any) => {
    const { latency, medianLatency, samples, status, errorMessage, errorType } = result;
    
    if (status === 'loading') return <Skeleton className="h-6 w-16" />;
    
    if (status === 'error' || (latency === null && medianLatency === null)) {
      // Get the appropriate icon based on error type
      const getErrorIcon = () => {
        switch(errorType) {
          case 'timeout':
            return <Clock size={14} className="mr-1" />;
          case 'rate-limit':
            return <Ban size={14} className="mr-1" />;
          case 'connection':
            return <ExternalLink size={14} className="mr-1" />;
          case 'rpc-error':
            return <AlertTriangle size={14} className="mr-1" />;
          default:
            return <AlertCircle size={14} className="mr-1" />;
        }
      };
      
      const shortErrorMessage = 
        errorType === 'timeout' ? 'Timeout' :
        errorType === 'rate-limit' ? 'Rate Limited' :
        errorType === 'connection' ? 'Unreachable' :
        errorType === 'rpc-error' ? 'RPC Error' :
        'Failed';
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center text-red-500">
                {getErrorIcon()}
                <span>Failed: {shortErrorMessage}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{errorMessage || 'Connection failed'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    // If we have multiple samples, show median value prominently
    const sampleCount = samples?.length || 0;
    
    if (sampleCount > 1 && medianLatency !== null) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <span className="font-medium">{medianLatency} ms</span>
                <BarChart size={14} className="text-gray-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p className="font-medium mb-1">P50 (median) latency: {medianLatency} ms</p>
                <p>Latest reading: {latency} ms</p>
                <p>Based on {sampleCount} samples</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    // Simple display for single reading
    return <span className="font-medium">{latency} ms</span>;
  };

  // Get color class based on latency
  const getLatencyColorClass = (result: any) => {
    const { latency, medianLatency, status } = result;
    // Use median for color if available, otherwise fall back to latest reading
    const value = (medianLatency !== null) ? medianLatency : latency;
    
    if (status === 'loading') return "bg-gray-200 dark:bg-gray-700";
    if (status === 'error' || value === null) return "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (value < 100) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (value < 300) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  };

  if (!hasRun) {
    return (
      <Card className="glass-card mb-6 animate-fade-in">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Zap size={48} className="mb-4 opacity-70" />
          <h3 className="text-xl font-medium mb-2">Measure RPC Latency</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
            Test the connection speed between your browser and {networkName} RPC endpoints.
          </p>
          <Button 
            onClick={runLatencyTest} 
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} className={isRunning ? "animate-spin" : ""} />
            Run Latency Test
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="glass-card p-6 mb-6 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-medium">Your Browser To {networkName} RPCs</h2>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1"
          onClick={() => runLatencyTest()}
          disabled={isRunning}
        >
          <RefreshCw size={16} className={isRunning ? "animate-spin" : ""} />
          <span>{isRunning ? "Running..." : "Refresh"}</span>
        </Button>
      </div>
      
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex items-center">
        <div>
          <p>This test measures the latency between your browser and the RPC endpoints. P50 (median) values are shown when available.</p>
        </div>
        {lastUpdated && (
          <div className="ml-auto flex items-center text-gray-500 text-xs">
            <History size={14} className="mr-1" />
            <span>Last updated: {lastUpdated}</span>
          </div>
        )}
      </div>
      
      <div className="relative my-8">
        {/* User location box */}
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm z-10 w-56">
          <div className="text-xs text-gray-500 mb-1">Your Connection</div>
          <div className="flex items-center gap-2 mb-2">
            <Globe size={16} />
            <span className="text-sm font-medium">{geoInfo.location || 'Detecting...'}</span>
          </div>
          
          {geoInfo.asn && (
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
              <Wifi size={14} />
              <span>{geoInfo.asn}</span>
              {geoInfo.isp && <span>· {geoInfo.isp}</span>}
            </div>
          )}
        </div>
        
        {/* Connection lines and results */}
        <div className="ml-[220px] space-y-6">
          {results.map((result, index) => (
            <div key={index} className="flex items-center">
              <div className="flex-shrink-0 h-px w-32 bg-blue-400"></div>
              
              {/* Latency box */}
              <div className={`px-3 py-1 rounded-md text-sm ${getLatencyColorClass(result)}`}>
                {formatLatency(result)}
              </div>
              
              <div className="flex-shrink-0 h-px w-4 bg-blue-400"></div>
              
              {/* Server box */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Provider</div>
                <div className="flex items-center gap-2">
                  <Server size={16} />
                  <span className="text-sm font-medium">{result.provider}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Premium RPC feature coming soon announcement */}
      <div className="mt-10 border border-dashed border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-blue-500" />
          <h3 className="font-medium text-blue-700 dark:text-blue-300">Coming Soon: Premium RPC Latency Testing</h3>
        </div>
        <p className="text-sm text-blue-600 dark:text-blue-400">
          Soon you'll be able to test latency to your own premium/paid RPC endpoints. Compare the performance of your private endpoints with public ones for optimal {networkName} connectivity.
        </p>
      </div>
    </div>
  );
};

export default LatencyTest;
