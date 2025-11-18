export type ChannelRole = "admin" | "staff" | "observer";

export type ChannelMember = {
  userId: string;
  role: ChannelRole;
  isBlocked?: boolean;
};

export type Channel = {
  id: string;
  name: string;
  description: string;
  rules: Record<string, unknown>;
  members?: ChannelMember[];
  isPublic?: boolean;
};
