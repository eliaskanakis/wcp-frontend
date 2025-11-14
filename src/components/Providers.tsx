"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ChannelsProvider } from "@/context/ChannelsContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ChannelsProvider>{children}</ChannelsProvider>
    </AuthProvider>
  );
}
