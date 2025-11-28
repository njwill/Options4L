import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';

export interface LegPriceData {
  legId: string;
  symbol: string;
  strike: number;
  expiration: string;
  type: string;
  bid?: number;
  ask?: number;
  last?: number;
  mark?: number;
  impliedVolatility?: number;
  underlyingPrice?: number;
  error?: string;
}

interface PositionPriceCache {
  prices: Record<string, LegPriceData>;
  fetchedAt: number;
}

interface PriceCacheContextType {
  getPositionPrices: (positionId: string) => Record<string, LegPriceData> | null;
  getAllCachedPrices: () => Record<string, Record<string, LegPriceData>>;
  setPositionPrices: (positionId: string, prices: Record<string, LegPriceData>) => void;
  clearPositionPrices: (positionId: string) => void;
  clearAllPrices: () => void;
  hasPositionPrices: (positionId: string) => boolean;
  hasCachedPrices: () => boolean;
  lastRefreshTime: Date | null;
  setLastRefreshTime: (time: Date) => void;
}

const PriceCacheContext = createContext<PriceCacheContextType | null>(null);

export function LivePriceCacheProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cache, setCache] = useState<Record<string, PositionPriceCache>>({});
  const [lastRefreshTime, setLastRefreshTimeState] = useState<Date | null>(null);
  const prevUserIdRef = useRef<number | undefined>(undefined);

  const setLastRefreshTime = useCallback((time: Date) => {
    setLastRefreshTimeState(time);
  }, []);

  const getPositionPrices = useCallback((positionId: string): Record<string, LegPriceData> | null => {
    return cache[positionId]?.prices || null;
  }, [cache]);

  const getAllCachedPrices = useCallback((): Record<string, Record<string, LegPriceData>> => {
    const result: Record<string, Record<string, LegPriceData>> = {};
    Object.entries(cache).forEach(([positionId, positionCache]) => {
      result[positionId] = positionCache.prices;
    });
    return result;
  }, [cache]);

  const hasCachedPrices = useCallback((): boolean => {
    return Object.keys(cache).length > 0;
  }, [cache]);

  const setPositionPrices = useCallback((positionId: string, prices: Record<string, LegPriceData>) => {
    setCache(prev => ({
      ...prev,
      [positionId]: {
        prices,
        fetchedAt: Date.now(),
      },
    }));
  }, []);

  const clearPositionPrices = useCallback((positionId: string) => {
    setCache(prev => {
      const next = { ...prev };
      delete next[positionId];
      return next;
    });
  }, []);

  const clearAllPrices = useCallback(() => {
    setCache({});
    setLastRefreshTimeState(null);
  }, []);

  const hasPositionPrices = useCallback((positionId: string): boolean => {
    return !!cache[positionId] && Object.keys(cache[positionId].prices).length > 0;
  }, [cache]);

  useEffect(() => {
    const currentUserId = user?.id;
    const prevUserId = prevUserIdRef.current;

    if (prevUserId !== undefined && currentUserId !== prevUserId) {
      clearAllPrices();
    }

    prevUserIdRef.current = currentUserId;
  }, [user?.id, clearAllPrices]);

  return (
    <PriceCacheContext.Provider value={{
      getPositionPrices,
      getAllCachedPrices,
      setPositionPrices,
      clearPositionPrices,
      clearAllPrices,
      hasPositionPrices,
      hasCachedPrices,
      lastRefreshTime,
      setLastRefreshTime,
    }}>
      {children}
    </PriceCacheContext.Provider>
  );
}

export function usePriceCache() {
  const context = useContext(PriceCacheContext);
  if (!context) {
    throw new Error('usePriceCache must be used within a LivePriceCacheProvider');
  }
  return context;
}

/**
 * Calculate live unrealized P/L for a position based on cached prices
 * Returns null if no valid price data is available
 */
export function calculateLivePositionPL(
  position: { id: string; legs: any[]; status: string },
  cachedPrices: Record<string, LegPriceData> | null
): number | null {
  if (!cachedPrices || position.status !== 'open') {
    return null;
  }
  
  let totalPL = 0;
  let hasValidData = false;
  
  position.legs.forEach((leg: any, index: number) => {
    if (leg.status !== 'open') return;
    
    const legId = `${position.id}-leg-${index}`;
    const priceData = cachedPrices[legId];
    
    if (priceData?.mark && priceData.mark > 0) {
      hasValidData = true;
      const entryPrice = Math.abs(leg.amount) / leg.quantity / 100;
      const currentPrice = priceData.mark;
      const isSell = leg.transCode === 'STO' || leg.transCode === 'STC';
      const unrealizedPL = isSell 
        ? (entryPrice - currentPrice) * leg.quantity * 100
        : (currentPrice - entryPrice) * leg.quantity * 100;
      totalPL += unrealizedPL;
    }
  });
  
  return hasValidData ? totalPL : null;
}

/**
 * Calculate total live P/L across all open positions with cached prices
 */
export function calculateTotalLivePL(
  positions: { id: string; legs: any[]; status: string; netPL: number }[],
  allCachedPrices: Record<string, Record<string, LegPriceData>>
): { liveOpenPL: number; liveTotalPL: number; realizedPL: number; hasLiveData: boolean } {
  let liveOpenPL = 0;
  let realizedPL = 0;
  let hasLiveData = false;
  
  positions.forEach(position => {
    if (position.status === 'open') {
      const cachedPrices = allCachedPrices[position.id];
      const livePL = calculateLivePositionPL(position, cachedPrices);
      
      if (livePL !== null) {
        liveOpenPL += livePL;
        hasLiveData = true;
      } else {
        // Fall back to static netPL for positions without live prices
        liveOpenPL += position.netPL;
      }
    } else {
      // Closed positions contribute to realized P/L
      realizedPL += position.netPL;
    }
  });
  
  return {
    liveOpenPL,
    liveTotalPL: liveOpenPL + realizedPL,
    realizedPL,
    hasLiveData,
  };
}
