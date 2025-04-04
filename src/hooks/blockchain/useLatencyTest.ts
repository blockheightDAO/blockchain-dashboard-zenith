
import { useState, useCallback, useEffect } from 'react';
import { NETWORKS } from '@/lib/api';

export interface LatencyResult {
  provider: string;
  endpoint: string;
  latency: number | null; // in milliseconds
  medianLatency: number | null; // P50 latency value
  samples: number[]; // track multiple latency samples
  status: 'loading' | 'success' | 'error';
  errorMessage?: string;
  errorType?: 'timeout' | 'rate-limit' | 'connection' | 'rpc-error' | 'unknown';
}

export interface GeoLocationInfo {
  location: string | null;
  asn: string | null;
  isp: string | null;
}

interface StoredLatencyData {
  results: LatencyResult[];
  timestamp: number;
}

// How long to consider stored latency data valid (5 minutes)
const LATENCY_DATA_TTL = 5 * 60 * 1000;

// Calculate median (P50) value from an array of numbers
const calculateMedian = (values: number[]): number | null => {
  if (!values || values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  } else {
    return sorted[middle];
  }
};

export const useLatencyTest = (networkId: string) => {
  const [results, setResults] = useState<LatencyResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [geoInfo, setGeoInfo] = useState<GeoLocationInfo>({
    location: null,
    asn: null,
    isp: null
  });
  const [hasRun, setHasRun] = useState(false);

  // Check for stored latency data on component mount
  useEffect(() => {
    const storedData = localStorage.getItem(`latency-results-${networkId}`);
    if (storedData) {
      try {
        const parsedData: StoredLatencyData = JSON.parse(storedData);
        const dataAge = Date.now() - parsedData.timestamp;
        
        // Only use stored data if it's recent enough
        if (dataAge < LATENCY_DATA_TTL && parsedData.results.length > 0) {
          setResults(parsedData.results);
          setHasRun(true);
          // Also fetch user geo info when using stored results
          fetchGeoInfo();
        }
      } catch (e) {
        console.error('Error parsing stored latency data:', e);
        // Invalid data, will run test normally when requested
      }
    }
    
    // Check for block height latency data and incorporate it
    const blockHeightLatencyKey = `blockheight-latency-${networkId}`;
    const blockHeightLatencyData = localStorage.getItem(blockHeightLatencyKey);
    
    if (blockHeightLatencyData) {
      try {
        const latencyData = JSON.parse(blockHeightLatencyData);
        if (latencyData && Object.keys(latencyData).length > 0) {
          updateFromBlockHeightLatency(latencyData);
        }
      } catch (e) {
        console.error('Error parsing block height latency data:', e);
      }
    }
  }, [networkId]);
  
  // Process and update latency data from block height monitoring
  const updateFromBlockHeightLatency = useCallback((blockHeightLatency: Record<string, { latency: number, endpoint: string, timestamp: number }>) => {
    setResults(prevResults => {
      const updatedResults = [...prevResults];
      
      // For each entry in the block height latency data
      Object.entries(blockHeightLatency).forEach(([provider, data]) => {
        const { latency, endpoint } = data;
        if (latency <= 0) return; // Skip invalid latency values
        
        // Find matching provider in existing results
        const existingIndex = updatedResults.findIndex(r => r.provider === provider);
        
        if (existingIndex >= 0) {
          // Update existing provider data
          const existing = updatedResults[existingIndex];
          const samples = [...(existing.samples || []), latency].slice(-10); // Keep last 10 samples
          
          updatedResults[existingIndex] = {
            ...existing,
            latency: latency, // Most recent latency
            samples: samples,
            medianLatency: calculateMedian(samples),
            status: 'success'
          };
        } else {
          // Add new provider data
          updatedResults.push({
            provider,
            endpoint,
            latency,
            samples: [latency],
            medianLatency: latency, // With only one sample, median = the value
            status: 'success'
          });
        }
      });
      
      // Store updated results
      if (updatedResults.length > 0) {
        localStorage.setItem(`latency-results-${networkId}`, JSON.stringify({
          results: updatedResults,
          timestamp: Date.now()
        }));
        setHasRun(true);
      }
      
      return updatedResults;
    });
  }, [networkId]);
  
  // Listen for block height latency updates
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `blockheight-latency-${networkId}` && e.newValue) {
        try {
          const latencyData = JSON.parse(e.newValue);
          if (latencyData && Object.keys(latencyData).length > 0) {
            updateFromBlockHeightLatency(latencyData);
          }
        } catch (error) {
          console.error('Error processing block height latency update:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [networkId, updateFromBlockHeightLatency]);

  // Function to fetch user's geo information
  const fetchGeoInfo = useCallback(async () => {
    try {
      const locationResponse = await fetch('https://ipapi.co/json/');
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        
        // Format location string
        let locationString = 'Unknown Location';
        if (locationData.city && locationData.region && locationData.country) {
          locationString = `${locationData.city}, ${locationData.region}, ${locationData.country}`;
        }
        
        // Get ASN and ISP information if available
        const asnInfo = locationData.asn ? `AS${locationData.asn}` : null;
        const ispInfo = locationData.org || null;
        
        setGeoInfo({
          location: locationString,
          asn: asnInfo,
          isp: ispInfo
        });
      } else {
        setGeoInfo({
          location: 'Unknown Location',
          asn: null,
          isp: null
        });
      }
    } catch (error) {
      console.log('Failed to get location:', error);
      setGeoInfo({
        location: 'Unknown Location',
        asn: null,
        isp: null
      });
    }
  }, []);

  // Function to measure latency to an RPC endpoint
  const measureLatency = useCallback(async (endpoint: string, providerName: string): Promise<LatencyResult> => {
    try {
      const startTime = performance.now();
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });
      
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      if (!response.ok) {
        // Categorize HTTP errors
        let errorType: LatencyResult['errorType'] = 'unknown';
        let errorMessage = `HTTP error: ${response.status}`;
        
        if (response.status === 429) {
          errorType = 'rate-limit';
          errorMessage = 'Rate limit exceeded';
        } else if (response.status >= 500) {
          errorType = 'rpc-error';
          errorMessage = 'Server error';
        } else if (response.status === 403) {
          errorType = 'connection';
          errorMessage = 'Access denied';
        }
        
        return {
          provider: providerName,
          endpoint,
          latency: null,
          samples: [],
          medianLatency: null,
          status: 'error',
          errorMessage,
          errorType
        };
      }
      
      const data = await response.json();
      
      if (data.error) {
        return {
          provider: providerName,
          endpoint,
          latency: null,
          samples: [],
          medianLatency: null,
          status: 'error',
          errorMessage: data.error.message || 'RPC error',
          errorType: 'rpc-error'
        };
      }
      
      return {
        provider: providerName,
        endpoint,
        latency,
        samples: [latency],
        medianLatency: latency, // With only one sample, median = the value
        status: 'success'
      };
    } catch (error) {
      // Categorize JavaScript errors
      let errorType: LatencyResult['errorType'] = 'unknown';
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        errorType = 'timeout';
        errorMessage = 'Connection timed out';
      } else if (errorMessage.includes('Failed to fetch')) {
        errorType = 'connection';
        errorMessage = 'Connection failed';
      }
      
      return {
        provider: providerName,
        endpoint,
        latency: null,
        samples: [],
        medianLatency: null,
        status: 'error',
        errorMessage,
        errorType
      };
    }
  }, []);

  // Function to run a full latency test for all endpoints of a network
  const runLatencyTest = useCallback(async () => {
    if (!networkId || isRunning) return;
    
    // Check for recent stored results first
    const storedData = localStorage.getItem(`latency-results-${networkId}`);
    if (storedData) {
      try {
        const parsedData: StoredLatencyData = JSON.parse(storedData);
        const dataAge = Date.now() - parsedData.timestamp;
        
        if (dataAge < LATENCY_DATA_TTL && parsedData.results.length > 0) {
          setResults(parsedData.results);
          setHasRun(true);
          await fetchGeoInfo();
          return; // Use stored results, don't run a new test
        }
      } catch (e) {
        // Invalid data, continue with the test
        console.error('Error parsing stored latency data:', e);
      }
    }
    
    const network = NETWORKS[networkId as keyof typeof NETWORKS];
    if (!network) return;
    
    setIsRunning(true);
    
    // Initialize results with loading state
    const initialResults = network.rpcs.map(rpc => ({
      provider: rpc.name,
      endpoint: rpc.url,
      latency: null,
      samples: [],
      medianLatency: null,
      status: 'loading' as const
    }));
    
    setResults(initialResults);
    
    // Try to get user's location
    await fetchGeoInfo();
    
    // Run tests in parallel but with a small delay between each to avoid rate limiting
    const results: LatencyResult[] = [];
    
    for (const rpc of network.rpcs) {
      const result = await measureLatency(rpc.url, rpc.name);
      results.push(result);
      // Add a small delay between requests to reduce chance of rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Store the results
    localStorage.setItem(`latency-results-${networkId}`, JSON.stringify({
      results,
      timestamp: Date.now()
    }));
    
    setResults(results);
    setIsRunning(false);
    setHasRun(true);
  }, [networkId, isRunning, measureLatency, fetchGeoInfo]);

  return {
    results,
    isRunning,
    geoInfo,
    runLatencyTest,
    hasRun
  };
};
