/**
 * Navigation and social link configuration
 */

import { Plus, Trophy, BookOpen } from "lucide-react";
import carouselIcon from "@/assets/menu-icons/carousel.png";
import upArrowIcon from "@/assets/menu-icons/up-arrow.png";
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
  { icon: Plus, label: "Create Coin", path: "/create" },
  { icon: Trophy, label: "Battle Leagues", path: "/battle-leagues" },
  { icon: userIcon, label: "Profile", path: "/profile" },
  { icon: BookOpen, label: "Docs", path: "/docs" },
];

export const socialLinks: SocialItem[] = [
  {
    href: "https://twitter.com/launchpad",
    ariaLabel: "X",
    tooltip: "X",
    color: "#000000",
    svgUrl: twitterIcon,
  },
  {
    href: "https://discord.gg/launchpad",
    ariaLabel: "Discord",
    tooltip: "Discord",
    color: "#5865F2",
    svgUrl: discordIcon,
  },
  {
    href: "https://t.me/launchpad",
    ariaLabel: "Telegram",
    tooltip: "Telegram",
    color: "#0088cc",
    svgUrl: telegramIcon,
  },
  // Docs moved into the main navigation
];
