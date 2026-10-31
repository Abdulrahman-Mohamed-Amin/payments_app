import { Injectable, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type Permission = 'admin' | 'full' | 'viewer';

export interface AppUser {
  id: string;
  email: string;
  username: string;
  name: string;
  permission: Permission;
  created_at: string;
  last_sign_in_at: string | null;
}

/** إدارة المستخدمين عبر Edge Function `manage-users` (للأدمن فقط) */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private supa = inject(SupabaseService);

  /** Returns `{ data }` or `{ error }` where error is a short code from the function (e.g. user_exists) */
  private async call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
    const { data, error } = await this.supa.getClient().functions.invoke('manage-users', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        try { return { error: (await error.context.json()).error ?? 'unknown' }; } catch { /* fall through */ }
      }
      return { error: error.message };
    }
    return { data: data as T };
  }

  async list(): Promise<{ data?: AppUser[]; error?: string }> {
    const res = await this.call<{ users: AppUser[] }>({ action: 'list' });
    return res.error ? { error: res.error } : { data: res.data!.users };
  }

  create(user: { username: string; password: string; name: string; permission: Permission }) {
    return this.call<{ id: string }>({ action: 'create', ...user });
  }

  update(id: string, changes: { permission?: Permission; password?: string }) {
    return this.call<{ ok: true }>({ action: 'update', id, ...changes });
  }

  remove(id: string) {
    return this.call<{ ok: true }>({ action: 'delete', id });
  }
}
