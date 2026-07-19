import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { IconComponent } from '../core/icon/icon.component';
import { NAV_MAIN, NAV_OTHER } from './nav-data';
import { PaymentsService } from '../core/payments.service';
import { AuthService } from '../core/auth.service';
import { ToastComponent } from '../core/toast/toast.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, IconComponent, ToastComponent],
  templateUrl: './layout.component.html',
})
export class LayoutComponent {
  readonly navMain = NAV_MAIN;
  readonly navOther = NAV_OTHER;
  readonly payments = inject(PaymentsService);
  readonly auth = inject(AuthService);

  title = 'لوحة التحكم';
  subtitle = 'نظرة عامة على الوحدات والعقود';
  sidebarOpen = false;
  notifOpen = false;

  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebar() { this.sidebarOpen = false; }
  toggleNotif() { this.notifOpen = !this.notifOpen; }

  @HostListener('document:click', ['$event.target'])
  onDocClick(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest('#notif-btn') && !target.closest('#notif-panel')) {
      this.notifOpen = false;
    }
  }

  constructor(private router: Router, private route: ActivatedRoute) {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => {
          let r = this.route;
          while (r.firstChild) r = r.firstChild;
          return r.snapshot.data;
        }),
      )
      .subscribe((data) => {
        this.title = (data['title'] as string) ?? this.title;
        this.subtitle = (data['subtitle'] as string) ?? this.subtitle;
        this.closeSidebar();
        this.notifOpen = false;
      });
  }
}
