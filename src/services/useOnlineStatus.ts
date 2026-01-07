import { useEffect, useState } from 'react';
import { checkConnection } from './api';

export const useOnlineStatus = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = async () => {
      // Vérifier la connexion réelle avec l'API
      const isReallyOnline = await checkConnection();
      setOnline(isReallyOnline);
      setLastChecked(new Date());
    };

    const handleOffline = () => {
      setOnline(false);
      setLastChecked(new Date());
    };

    const interval = setInterval(async () => {
      if (navigator.onLine) {
        const isReallyOnline = await checkConnection();
        setOnline(isReallyOnline);
        setLastChecked(new Date());
      } else {
        setOnline(false);
      }
    }, 30000); // Toutes les 30 secondes

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    handleOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { online, lastChecked };
};
