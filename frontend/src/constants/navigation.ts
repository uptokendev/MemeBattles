/**
 * Navigation and social link configuration
 */

import { BookOpen, Eye, Plus, User } from "lucide-react";
import carouselIcon from "@/assets/menu-icons/carousel.png";
import userIcon from "@/assets/menu-icons/user.png";
import twitterIcon from "@/assets/social/twitter.png";
import discordIcon from "@/assets/social/discord.png";
import telegramIcon from "@/assets/social/telegram.png";
import { SocialItem } from "@/components/ui/social-media";
import { isPostGradNavEnabled, postGradFlags } from "@/features/postgrad/config";

export interface NavItem {
  icon: string | typeof Plus;
  label: string;
  path: string;
}

export interface ArenaSubNavItem {
  label: string;
  path: string;
}

export const arenaSubNavItems: ArenaSubNavItem[] = isPostGradNavEnabled()
  ? [
      { label: "Overview", path: "/arena" },
      { label: "Battles", path: "/arena/battles" },
      { label: "Leagues", path: "/arena/leagues" },
      { label: "Events", path: "/arena/events" },
    ]
  : [];

export const navItems: NavItem[] = [
  { icon: carouselIcon, label: "Launchpad", path: "/" },
  ...(postGradFlags.enabled && postGradFlags.warRoom ? [{ icon: Eye, label: "Trade War Room", path: "/war-room" }] : []),
  { icon: Plus, label: "Create Coin", path: "/create" },
  { icon: userIcon, label: "Creator tools", path: "/command" },
  { icon: User, label: "Profile", path: "/profile" },
  { icon: BookOpen, label: "Docs", path: "https://docs.memewar.zone" },
];

export const socialLinks: SocialItem[] = [
  {
    href: "https://x.com/memewarzone",
    ariaLabel: "X",
    tooltip: "X",
    color: "#000000",
    svgUrl: twitterIcon,
  },
  {
    href: "https://discord.gg/aXTkn3Asu",
    ariaLabel: "Discord",
    tooltip: "Discord",
    color: "#5865F2",
    svgUrl: discordIcon,
  },
  {
    href: "https://t.me/memewarzonehq",
    ariaLabel: "Telegram",
    tooltip: "Telegram",
    color: "#0088cc",
    svgUrl: telegramIcon,
  },
];
