import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/** Loads translation JSON files from the public assets folder (public/i18n/{lang}.json,
 *  served at the app root alongside index.html — same place logo-blue.png etc. live). */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private http = inject(HttpClient);

  /** Cache-buster so browsers never keep a stale translation file after a deploy. */
  private readonly version = Date.now();

  getTranslation(lang: string) {
    return this.http.get<Translation>(`i18n/${lang}.json?v=${this.version}`);
  }
}
