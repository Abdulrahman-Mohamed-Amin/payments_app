import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { IconComponent } from '../../core/icon/icon.component';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, TranslocoModule],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly lang = inject(LanguageService);

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
