// lib/sync/online.ts — one NetInfo subscription behind a hook. `isConnected`
// is null while NetInfo is still asking the OS, and null must read as online:
// we never cry wolf on boot, only on a definitive `false`.
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((s) => setOnline(s.isConnected !== false));
    return unsubscribe;
  }, []);

  return online;
}
