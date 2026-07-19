import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { title: 'لوحة التحكم', subtitle: 'نظرة عامة على الوحدات والعقود' },
      },
      {
        path: 'payments',
        loadComponent: () => import('./pages/payments/payments.component').then((m) => m.PaymentsComponent),
        data: { title: 'الدفعات', subtitle: 'متابعة دفعات العملاء ومواعيد الاستحقاق' },
      },
      {
        path: 'payments/:project',
        loadComponent: () => import('./pages/payments/payments-detail.component').then((m) => m.PaymentsDetailComponent),
        data: { title: 'تفاصيل المشروع', subtitle: 'دفعات عملاء المشروع' },
      },
      {
        path: 'generate',
        loadComponent: () => import('./pages/generate/generate.component').then((m) => m.GenerateComponent),
        data: { title: 'إنشاء الوثائق', subtitle: 'توليد العقود وإشعارات الدفع' },
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
        data: { title: 'الإعدادات', subtitle: 'تخصيص الحساب والتفضيلات' },
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
