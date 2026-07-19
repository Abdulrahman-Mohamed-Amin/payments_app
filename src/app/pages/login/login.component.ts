import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IconComponent } from '../../core/icon/icon.component';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  showPassword = false;
  submitting = false;
  errorMsg = '';

  readonly highlights = [
    'تتبّع حالة الوحدات لحظياً',
    'تنبيهات قبل انتهاء العقود',
    'تقارير إيرادات فورية',
  ];

  get valid(): boolean {
    return this.username.trim().length > 2 && this.password.length >= 6;
  }

  async submit(): Promise<void> {
    if (!this.valid || this.submitting) return;
    this.submitting = true;
    this.errorMsg = '';
    const err = await this.auth.signIn(this.username, this.password);
    if (err) {
      this.errorMsg = err;
      this.submitting = false;
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
