"use client";

import React, { useState, useEffect } from 'react';

/**
 * ClientOnly component ensures its children are only rendered on the client side.
 * This prevents hydration mismatches when using localStorage or other browser APIs.
 */
export default function ClientOnly({ children }) {
  // Initialize with false to ensure server and client render the same initially
  const [isClient, setIsClient] = useState(false);

  // Use useEffect to set isClient to true only on the client side
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);
  }, []);

  // Return null during server-side rendering
  if (!isClient) {
    return null;
  }

  return <>{children}</>;
}