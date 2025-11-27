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
  setPositionPrices: (positionId: string, prices: Record<string, LegPriceData>) => void;
  clearPositionPrices: (positionId: string) => void;
  clearAllPrices: () => void;
  hasPositionPrices: (positionId: string) => boolean;
}

const PriceCacheContext = createContext<PriceCacheContextType | null>(null);

export function LivePriceCacheProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cache, setCache] = useState<Record<string, PositionPriceCache>>({});
  const prevUserIdRef = useRef<number | undefined>(undefined);

  const getPositionPrices = useCallback((positionId: string): Record<string, LegPriceData> | null => {
    return cache[positionId]?.prices || null;
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
      setPositionPrices,
      clearPositionPrices,
      clearAllPrices,
      hasPositionPrices,
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
