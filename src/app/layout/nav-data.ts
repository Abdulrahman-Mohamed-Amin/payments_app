import { IconName } from '../core/icon/icon.component';

export interface NavItem {
  label: string;
  icon: IconName;
  route: string;
}

export const NAV_MAIN: NavItem[] = [
  { label: 'لوحة التحكم', icon: 'grid', route: '/dashboard' },
  { label: 'إنشاء الوثائق', icon: 'doc', route: '/generate' },
  { label: 'الدفعات', icon: 'money', route: '/payments' },
];

export const NAV_OTHER: NavItem[] = [
  { label: 'الإعدادات', icon: 'gear', route: '/settings' },
];
