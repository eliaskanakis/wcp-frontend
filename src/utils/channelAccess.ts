import type { UserProfile } from "@/context/AuthContext";
import type { Channel, ChannelMember } from "@/types/channel";

type MaybeProfile = UserProfile | null;

function findMember(
  channel: Channel,
  profile: MaybeProfile
): ChannelMember | undefined {
  if (!profile) return undefined;
  return channel.members?.find((member) => member.userId === profile.uid);
}

function isActiveMember(member?: ChannelMember) {
  return Boolean(member && !member.isBlocked);
}

export function canViewChannel(channel: Channel, profile: MaybeProfile) {
  if (profile?.globalAdmin) return true;
  if (channel.isPublic) return true;
  const member = findMember(channel, profile);
  return isActiveMember(member);
}

export function isChannelAdmin(channel: Channel, profile: MaybeProfile) {
  if (profile?.globalAdmin) return true;
  const member = findMember(channel, profile);
  return Boolean(member && !member.isBlocked && member.role === "admin");
}

export function isChannelMember(channel: Channel, profile: MaybeProfile) {
  if (profile?.globalAdmin) return true;
  const member = findMember(channel, profile);
  return isActiveMember(member);
}
