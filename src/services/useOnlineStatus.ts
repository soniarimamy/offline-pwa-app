import { useEffect, useState, useCallback } from 'react';
import { checkConnection } from './api';

export const useOnlineStatus = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const checkPendingSyncs = useCallback(() => {
    if ('serviceWorker' in navigator) {
      const messageChannel = new MessageChannel();

      navigator.serviceWorker.controller?.postMessage({ type: 'GET_PENDING_SYNC_COUNT' }, [
        messageChannel.port2,
      ]);

      messageChannel.port1.onmessage = (event) => {
        const count = event.data.count || 0;
        setPendingSyncCount(count);
        setPendingSync(count > 0);
      };
    } else {
      const pendingSyncs = JSON.parse(localStorage.getItem('sync-queue') || '[]');
      setPendingSyncCount(pendingSyncs.length);
      setPendingSync(pendingSyncs.length > 0);
    }
  }, []);

  const checkRealConnection = useCallback(async () => {
    try {
      const isOnline = await checkConnection();
      setOnline(isOnline);
      setLastChecked(new Date());

      if (isOnline) {
        checkPendingSyncs();
      }

      return isOnline;
    } catch (error) {
      setOnline(false);
      return false;
    }
  }, [checkPendingSyncs]);

  const triggerManualSync = useCallback(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage({
        type: 'TRIGGER_SYNC',
      });
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      await checkRealConnection();
    };

    const handleOffline = () => {
      setOnline(false);
      setLastChecked(new Date());
    };

    const interval = setInterval(checkRealConnection, 30000);
    const syncCheckInterval = setInterval(checkPendingSyncs, 60000);

    checkRealConnection();
    checkPendingSyncs();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_COMPLETE') {
          checkPendingSyncs();
        }
      });
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      clearInterval(syncCheckInterval);
    };
  }, [checkRealConnection, checkPendingSyncs]);

  return {
    online,
    lastChecked,
    pendingSync,
    pendingSyncCount,
    checkRealConnection,
    triggerManualSync,
    requestNotificationPermission,
    checkPendingSyncs,
  };
};
