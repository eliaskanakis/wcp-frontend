"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Channel } from "@/types/channel";

type ChannelsContextValue = {
  channels: Channel[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const ChannelsContext = createContext<ChannelsContextValue | undefined>(
  undefined
);

export function ChannelsProvider({ children }: { children: React.ReactNode }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const syncChannels = useCallback(async () => {
    setLoading(true);
    try {
      const channelsDoc = doc(db, "config", "channels");
      let snapshot = await getDoc(channelsDoc);

      if (!snapshot.exists()) {
        const response = await fetch("/default-channels.json", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Unable to load default channels file.");
        }

        const data = (await response.json()) as Channel[];

        await setDoc(channelsDoc, {
          items: data,
          seededAt: serverTimestamp(),
        });

        snapshot = await getDoc(channelsDoc);
      }

      const payload = snapshot.data();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setChannels(items as Channel[]);
    } catch (error) {
      console.error("Failed to sync channels", error);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void syncChannels();
  }, [syncChannels]);

  const value = useMemo(
    () => ({
      channels,
      loading,
      refresh: syncChannels,
    }),
    [channels, loading, syncChannels]
  );

  return (
    <ChannelsContext.Provider value={value}>
      {children}
    </ChannelsContext.Provider>
  );
}

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (!context) {
    throw new Error("useChannels must be used within a ChannelsProvider");
  }
  return context;
}
