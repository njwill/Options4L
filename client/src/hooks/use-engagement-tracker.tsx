import { useState, useEffect, useCallback, useRef } from 'react';

interface EngagementTrackerOptions {
  clickThreshold?: number;
  pageChangeThreshold?: number;
  enabled?: boolean;
  initialPage?: string;
}

interface EngagementState {
  clicks: number;
  pageChanges: number;
  hasShownPrompt: boolean;
}

export function useEngagementTracker({
  clickThreshold = 5,
  pageChangeThreshold = 2,
  enabled = true,
  initialPage
}: EngagementTrackerOptions = {}) {
  const [state, setState] = useState<EngagementState>({
    clicks: 0,
    pageChanges: 0,
    hasShownPrompt: false
  });
  
  const [shouldShowPrompt, setShouldShowPrompt] = useState(false);
  const lastPath = useRef<string | null>(initialPage ?? null);
  const isInitialized = useRef(false);

  const hasMetThreshold = useCallback(() => {
    return (
      state.clicks >= clickThreshold || 
      state.pageChanges >= pageChangeThreshold
    ) && !state.hasShownPrompt;
  }, [state, clickThreshold, pageChangeThreshold]);

  const trackClick = useCallback(() => {
    if (!enabled || state.hasShownPrompt) return;
    
    setState(prev => ({
      ...prev,
      clicks: prev.clicks + 1
    }));
  }, [enabled, state.hasShownPrompt]);

  const trackPageChange = useCallback((newPath: string) => {
    if (!enabled || state.hasShownPrompt) return;
    
    // First call just initializes the reference without counting
    if (!isInitialized.current) {
      lastPath.current = newPath;
      isInitialized.current = true;
      return;
    }
    
    if (newPath !== lastPath.current) {
      lastPath.current = newPath;
      setState(prev => ({
        ...prev,
        pageChanges: prev.pageChanges + 1
      }));
    }
  }, [enabled, state.hasShownPrompt]);

  const markPromptShown = useCallback(() => {
    setState(prev => ({
      ...prev,
      hasShownPrompt: true
    }));
    setShouldShowPrompt(false);
  }, []);

  const resetTracker = useCallback(() => {
    setState({
      clicks: 0,
      pageChanges: 0,
      hasShownPrompt: false
    });
    setShouldShowPrompt(false);
    lastPath.current = null;
    isInitialized.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = 
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('[role="tab"]') ||
        target.closest('[data-testid]');
      
      if (isInteractive) {
        trackClick();
      }
    };

    document.addEventListener('click', handleClick, { capture: true });
    
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [enabled, trackClick]);

  useEffect(() => {
    if (hasMetThreshold() && !shouldShowPrompt) {
      const timer = setTimeout(() => {
        setShouldShowPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasMetThreshold, shouldShowPrompt]);

  return {
    state,
    shouldShowPrompt,
    trackPageChange,
    markPromptShown,
    resetTracker
  };
}
