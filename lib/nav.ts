import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  Radio,
  ArrowLeftRight,
  BarChart3,
  Settings2,
  ShieldAlert,
  Cog,
  Activity,
  ScrollText,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Shown in the bottom nav on mobile, and at the top of the sidebar on desktop.
export const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/signals', label: 'Signals', icon: Radio },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

// Collapsed into a "More" menu on mobile; shown below the primary items on
// the desktop sidebar.
export const SECONDARY_NAV: NavItem[] = [
  { href: '/strategy', label: 'Strategy', icon: Settings2 },
  { href: '/risk', label: 'Risk', icon: ShieldAlert },
  { href: '/settings', label: 'Settings', icon: Cog },
  { href: '/system', label: 'System', icon: Activity },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];
