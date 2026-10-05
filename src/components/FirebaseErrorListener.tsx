'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

export function FirebaseErrorListener() {
  useEffect(() => {
    const unsubscribe = errorEmitter.on('permission-error', (error) => {
      // Re-throw the error so it's caught by the Next.js error boundary/overlay
      // This is for development time visibility into Security Rule failures
      throw error;
    });

    return () => unsubscribe();
  }, []);

  return null;
}
