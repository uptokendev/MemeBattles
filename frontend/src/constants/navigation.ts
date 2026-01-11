/**
 * Navigation and social link configuration
 */

import { Plus } from "lucide-react";
import carouselIcon from "@/assets/menu-icons/carousel.png";
import upArrowIcon from "@/assets/menu-icons/up-arrow.png";
import userIcon from "@/assets/menu-icons/user.png";
import twitterIcon from "@/assets/social/twitter.png";
import discordIcon from "@/assets/social/discord.png";
import telegramIcon from "@/assets/social/telegram.png";
import bookIcon from "@/assets/social/book.png";
import { SocialItem } from "@/components/ui/social-media";

export interface NavItem {
  icon: string | typeof Plus;
  label: string;
  path: string;
}

export const navItems: NavItem[] = [
  { icon: carouselIcon, label: "Showcase", path: "/" },
  { icon: Plus, label: "Create", path: "/create" },
  { icon: upArrowIcon, label: "UP Now", path: "/up-now" },
  { icon: userIcon, label: "Profile", path: "/profile" },
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
  {
    href: "/playbook",
    ariaLabel: "Playbook",
    tooltip: "Playbook",
    color: "#10b981",
    svgUrl: bookIcon,
  },
];
