
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for implementing infinite scroll
 * @param {Function} callback - Function to call when bottom is reached
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Distance from bottom in pixels (default: 100)
 * @param {boolean} options.enabled - Whether infinite scroll is enabled (default: true)
 * @returns {Object} Scroll state and ref
 */
export const useInfiniteScroll = (callback, options = {}) => {
  const { threshold = 100, enabled = true } = options;
  const [isNearBottom, setIsNearBottom] = useState(false);
  const [prevEnabled, setPrevEnabled] = useState(enabled);

  // Reset near-bottom state when scrolling gets disabled (adjusted during render, not in an effect)
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    if (!enabled) setIsNearBottom(false);
  }
  const observerRef = useRef(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Intersection Observer callback
  const handleObserver = useCallback((entries) => {
    const [entry] = entries;
    if (entry.isIntersecting && enabled) {
      setIsNearBottom(true);
      callbackRef.current();
    }
  }, [enabled]);

  // Set up Intersection Observer
  useEffect(() => {
    const element = observerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0.1
    });

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [handleObserver, threshold, enabled]);


  return {
    observerRef,
    isNearBottom
  };
};
