/**
 * Navigation and social link configuration
 */

import { Plus, BookOpen, User, Swords, Target, LayoutPanelTop, Trophy, CalendarDays } from "lucide-react";
import carouselIcon from "@/assets/menu-icons/carousel.png";
import userIcon from "@/assets/menu-icons/user.png";
import twitterIcon from "@/assets/social/twitter.png";
import discordIcon from "@/assets/social/discord.png";
import telegramIcon from "@/assets/social/telegram.png";
import { SocialItem } from "@/components/ui/social-media";

export interface NavItem {
  icon: string | typeof Plus;
  label: string;
  path: string;
}

export const navItems: NavItem[] = [
  { icon: carouselIcon, label: "Launchpad", path: "/" },
  { icon: Swords, label: "Arena", path: "/arena" },
  { icon: Target, label: "War Room", path: "/war-room" },
  { icon: Plus, label: "Create Coin", path: "/create" },
  { icon: userIcon, label: "Command Center", path: "/command" },
  { icon: User, label: "Profile", path: "/profile" },
  { icon: BookOpen, label: "Docs", path: "https://docs.memewar.zone" },
];

export const arenaNavItems: NavItem[] = [
  { icon: LayoutPanelTop, label: "Overview", path: "/arena" },
  { icon: Swords, label: "Battles", path: "/arena/battles" },
  { icon: Trophy, label: "Leagues", path: "/arena/leagues" },
  { icon: CalendarDays, label: "Events", path: "/arena/events" },
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
