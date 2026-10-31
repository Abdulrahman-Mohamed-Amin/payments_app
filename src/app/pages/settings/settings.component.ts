import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../core/icon/icon.component';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { UsersService, AppUser, Permission } from '../../core/users.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, TranslocoModule],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly lang = inject(LanguageService);
  private usersApi = inject(UsersService);
  private toast = inject(ToastService);
  private transloco = inject(TranslocoService);

  name = '';
  company = '';
  email = '';
  role = '';
  notificationEmail = '';
  dailyEmailEnabled = true;

  notifyOverdue = true;
  notifyNewContract = true;
  notifyPaymentDue = true;

  currency = 'SAR';

  saving = false;
  saved = false;
  errorMsg = '';

  ngOnInit() {
    const meta = this.auth.currentUser?.user_metadata ?? {};
    this.name     = meta['name']    ?? 'عبدالرحمن الأمين';
    this.role     = meta['role']    ?? 'مدير لوحة التحكم';
    this.company  = meta['company'] ?? 'شركة مدائن العقارية';
    this.email    = this.auth.currentUser?.email ?? '';

    this.notificationEmail  = meta['notification_email']  ?? '';
    this.dailyEmailEnabled  = meta['daily_email_enabled'] ?? true;
    this.notifyOverdue      = meta['notifyOverdue']       ?? true;
    this.notifyNewContract  = meta['notifyNewContract']   ?? true;
    this.notifyPaymentDue   = meta['notifyPaymentDue']    ?? true;

    if (this.auth.isAdmin && !this.users.length) this.loadUsers();
  }

  // ── User management (admin only) ────────────────────────────────────────────
  readonly permissions: Permission[] = ['admin', 'full', 'viewer'];
  users: AppUser[] = [];
  usersLoading = false;
  usersError = '';

  newUserOpen = false;
  newName = '';
  newUsername = '';
  newPassword = '';
  newPermission: Permission = 'full';
  creatingUser = false;

  busyUserId = '';
  passwordTarget: AppUser | null = null;
  resetPassword = '';
  deleteTarget: AppUser | null = null;

  private errText(code: string): string {
    const key = `settings.userErrors.${code}`;
    const t = this.transloco.translate(key);
    return t === key ? this.transloco.translate('settings.userErrors.generic') : t;
  }

  async loadUsers() {
    this.usersLoading = true;
    this.usersError = '';
    const { data, error } = await this.usersApi.list();
    this.usersLoading = false;
    if (error) { this.usersError = this.errText(error); return; }
    this.users = data!.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createUser() {
    if (this.creatingUser) return;
    this.creatingUser = true;
    const { error } = await this.usersApi.create({
      username: this.newUsername.trim(), password: this.newPassword, name: this.newName.trim(), permission: this.newPermission,
    });
    this.creatingUser = false;
    if (error) { this.toast.error(this.errText(error)); return; }
    this.toast.success(this.transloco.translate('settings.userCreated'), this.newUsername.trim());
    this.newUserOpen = false;
    this.newName = this.newUsername = this.newPassword = '';
    this.newPermission = 'full';
    this.loadUsers();
  }

  async changePermission(u: AppUser, permission: Permission) {
    const prev = u.permission;
    u.permission = permission;
    this.busyUserId = u.id;
    const { error } = await this.usersApi.update(u.id, { permission });
    this.busyUserId = '';
    if (error) { u.permission = prev; this.toast.error(this.errText(error)); return; }
    this.toast.success(this.transloco.translate('settings.permissionUpdated'), u.name || u.username);
  }

  async savePassword() {
    const u = this.passwordTarget;
    if (!u || this.resetPassword.length < 6) return;
    this.busyUserId = u.id;
    const { error } = await this.usersApi.update(u.id, { password: this.resetPassword });
    this.busyUserId = '';
    if (error) { this.toast.error(this.errText(error)); return; }
    this.toast.success(this.transloco.translate('settings.passwordUpdated'), u.name || u.username);
    this.passwordTarget = null;
    this.resetPassword = '';
  }

  async confirmDeleteUser() {
    const u = this.deleteTarget;
    if (!u) return;
    this.busyUserId = u.id;
    const { error } = await this.usersApi.remove(u.id);
    this.busyUserId = '';
    if (error) { this.toast.error(this.errText(error)); return; }
    this.users = this.users.filter(x => x.id !== u.id);
    this.deleteTarget = null;
    this.toast.success(this.transloco.translate('settings.userDeleted'), u.name || u.username);
  }

  formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  async save() {
    if (this.saving) return;
    this.saving = true;
    this.errorMsg = '';

    const err = await this.auth.updateProfile({
      name:                this.name,
      role:                this.role,
      company:             this.company,
      notification_email:  this.notificationEmail.trim(),
      daily_email_enabled: this.dailyEmailEnabled,
      notifyOverdue:       this.notifyOverdue,
      notifyNewContract:   this.notifyNewContract,
      notifyPaymentDue:    this.notifyPaymentDue,
    });

    this.saving = false;
    if (err) {
      this.errorMsg = err;
    } else {
      this.saved = true;
      setTimeout(() => this.saved = false, 2500);
    }
  }
}
