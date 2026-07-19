import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../core/icon/icon.component';
import { SupabaseService } from '../../core/supabase.service';
import { ToastService } from '../../core/toast.service';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import * as XLSX from 'xlsx';

type Tab = 'contracts' | 'notifications';

interface DynamicField {
  varName: string;
  label: string;
  value: string;
  error: boolean;
}

interface PreviewRow {
  key: string;
  value: string;
  isHeader?: boolean;
}

const RESERVED = new Set([
  'unit_price', 'first_payment', 'contract_date',
  'unit_price_text', 'remaining_text',
  'p1_amount', 'p2_amount', 'p3_amount', 'p4_amount', 'p5_amount', 'p6_amount',
  'p1_date', 'p2_date', 'p3_date', 'p4_date', 'p5_date', 'p6_date',
]);

const INSTALL_PCT = [0.20, 0.20, 0.20, 0.20, 0.15, 0.05];
const INSTALL_MONTHS = [0, 3, 6, 9, 12, 15];
const INSTALL_NAMES_AR = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة'];
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const LABEL_MAP: Record<string, string> = {
  name: 'اسم المشتري',
  natonal: 'الجنسية',
  id: 'رقم الهوية',
  phone: 'رقم الهاتف',
  address: 'العنوان الوطني',
  mail: 'البريد الإلكتروني',
  unit_code: 'رقم الوحدة',
  floor: 'رقم الطابق',
  area: 'المساحة الإجمالية',
};

@Component({
  selector: 'app-generate',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './generate.component.html',
})
export class GenerateComponent implements OnInit {
  private supa = inject(SupabaseService);
  private toast = inject(ToastService);
  activeTab: Tab = 'contracts';
  cSaving = false;
  cSaveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';

  // ── Projects list ──────────────────────────────────────────────────────────────
  projectNames: string[] = [];
  selectedProject = '';

  async ngOnInit() {
    const projects = await this.supa.loadProjects();
    this.projectNames = projects.map(p => p.name);
  }

  // ── Contracts ──────────────────────────────────────────────────────────────────
  cTemplateFile: File | null = null;
  cTemplateName = '';
  cDynamicFields: DynamicField[] = [];
  cUnitPrice: any = '';
  cFirstPayment: any = '';
  cContractDate = '';
  cPreviewRows: PreviewRow[] = [];
  cShowPreview = false;
  cIsDragOver = false;
  cError = ''; // kept for cSaveStatus='error' display
  cGenerating = false;

  cUnitPriceError = false;
  cFirstPaymentError = false;
  cContractDateError = false;
  cProjectError = false;

  cExcelFile: File | null = null;
  cExcelRows: any[] = [];
  cExcelCols: string[] = [];
  cExcelName = '';
  cIsDragOverExcel = false;

  cNotifFile: File | null = null;
  cNotifName = '';
  cIsDragOverNotif = false;
  cBulkGenerating = false;
  cBulkStatus = '';

  // ── Notifications ──────────────────────────────────────────────────────────────
  nTemplateFile: File | null = null;
  nTemplateName = '';
  nDynamicFields: DynamicField[] = [];
  nIsDragOver = false;
  nError = '';
  nGenerating = false;

  nExcelFile: File | null = null;
  nExcelRows: any[] = [];
  nExcelCols: string[] = [];
  nExcelName = '';
  nIsDragOverExcel = false;
  nBulkGenerating = false;
  nBulkStatus = '';

  @ViewChild('cFileInput') cFileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('cExcelInput') cExcelInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('cNotifInput') cNotifInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('nFileInput') nFileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('nExcelInput') nExcelInputRef!: ElementRef<HTMLInputElement>;

  // ── Arabic utilities ────────────────────────────────────────────────────────────
  private toArabicWords(n: number): string {
    n = Math.round(n);
    if (n === 0) return 'صفر';
    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
      'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
      'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

    const belowThousand = (num: number): string => {
      if (num === 0) return '';
      const parts: string[] = [];
      const h = Math.floor(num / 100);
      const rem = num % 100;
      if (h > 0) parts.push(hundreds[h]);
      if (rem > 0) {
        if (rem < 20) parts.push(ones[rem]);
        else {
          const t = Math.floor(rem / 10), u = rem % 10;
          parts.push(u > 0 ? ones[u] + ' و' + tens[t] : tens[t]);
        }
      }
      return parts.join(' و');
    };

    const parts: string[] = [];
    const mil = Math.floor(n / 1_000_000); n %= 1_000_000;
    if (mil === 1) parts.push('مليون');
    else if (mil === 2) parts.push('مليونان');
    else if (mil >= 3 && mil <= 10) parts.push(ones[mil] + ' ملايين');
    else if (mil > 10) parts.push(belowThousand(mil) + ' مليون');

    const thou = Math.floor(n / 1000); n %= 1000;
    if (thou === 1) parts.push('ألف');
    else if (thou === 2) parts.push('ألفان');
    else if (thou >= 3 && thou <= 10) parts.push(ones[thou] + ' آلاف');
    else if (thou >= 11 && thou <= 99) parts.push(belowThousand(thou) + ' ألفاً');
    else if (thou >= 100) parts.push(belowThousand(thou) + ' ألف');

    if (n > 0) parts.push(belowThousand(n));
    return parts.join(' و');
  }

  private parseISO(val: string): Date {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private parseAnyDate(val: string): Date | null {
    val = val.trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(val)) {
      const [y, m, d] = val.split('-').map(Number);
      return this.safeDate(y, m, d);
    }
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(val)) {
      const p = val.split(/[\/\-]/).map(Number);
      return this.safeDate(p[2], p[1], p[0]);
    }
    // Excel date serial (e.g. 45292)
    if (/^\d{5}$/.test(val)) {
      const d = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private safeDate(y: number, m: number, d: number): Date | null {
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
    if (d.getDate() !== date.getDate()) d.setDate(0);
    return d;
  }

  private fmt(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }

  private fmtAmt(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private labelFor(v: string): string {
    return LABEL_MAP[v] ?? v.replace(/_/g, ' ');
  }

  // ── Template parsing ────────────────────────────────────────────────────────────
  private async parseDocxVars(file: File, filterReserved: boolean): Promise<string[]> {
    const buf = await file.arrayBuffer();
    const zip = new PizZip(buf);
    const tags = new Set<string>();
    const VALID = /^[؀-ۿa-zA-Z_][؀-ۿa-zA-Z0-9_ \-]*$/;
    for (const f of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml', 'word/header2.xml', 'word/footer2.xml']) {
      if (!zip.files[f]) continue;
      const xml: string = (zip.files[f] as any).asText().replace(/<[^>]+>/g, '');
      for (const m of xml.matchAll(/\{\{([^}]{1,80})\}\}/g)) {
        const name = m[1].trim();
        if (VALID.test(name)) tags.add(name);
      }
    }
    const all = [...tags];
    return filterReserved ? all.filter(t => !RESERVED.has(t)) : all;
  }

  private toFields(vars: string[]): DynamicField[] {
    return vars.map(v => ({ varName: v, label: this.labelFor(v), value: '', error: false }));
  }

  // ── Contracts: template upload ──────────────────────────────────────────────────
  cDragOver(e: DragEvent) { e.preventDefault(); this.cIsDragOver = true; }
  cDragLeave() { this.cIsDragOver = false; }
  cDrop(e: DragEvent) { e.preventDefault(); this.cIsDragOver = false; const f = e.dataTransfer?.files[0]; if (f) this.handleContractFile(f); }
  cFileChange(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.handleContractFile(f); }
  cClickUpload() { this.cFileInputRef.nativeElement.click(); }

  async handleContractFile(file: File) {
    if (!file.name.endsWith('.docx')) { this.toast.error('يرجى اختيار ملف Word بصيغة .docx'); return; }
    this.cTemplateFile = file;
    this.cTemplateName = file.name;
    try {
      this.cDynamicFields = this.toFields(await this.parseDocxVars(file, true));
      this.updatePreview();
    } catch (err: any) {
      this.toast.error('تعذّر قراءة القالب: ' + (err.message || err));
      this.cTemplateFile = null; this.cTemplateName = '';
    }
  }

  clearContractTemplate() {
    this.cTemplateFile = null; this.cTemplateName = '';
    this.cDynamicFields = []; this.cUnitPrice = ''; this.cFirstPayment = ''; this.cContractDate = '';
    this.cPreviewRows = []; this.cShowPreview = false;
    this.cExcelFile = null; this.cExcelRows = []; this.cExcelCols = []; this.cExcelName = '';
    this.cNotifFile = null; this.cNotifName = ''; this.cBulkStatus = '';
    if (this.cFileInputRef) this.cFileInputRef.nativeElement.value = '';
    if (this.cExcelInputRef) this.cExcelInputRef.nativeElement.value = '';
    if (this.cNotifInputRef) this.cNotifInputRef.nativeElement.value = '';
  }

  // ── Contracts: computed values / preview ────────────────────────────────────────
  private computeReserved(unitPrice: number, firstPayment: number, baseDate: Date | null): Record<string, string> {
    const d: Record<string, string> = {};
    d['unit_price'] = this.fmtAmt(unitPrice);
    d['first_payment'] = this.fmtAmt(firstPayment);
    d['contract_date'] = baseDate ? this.fmt(baseDate) : '';
    d['unit_price_text'] = this.toArabicWords(unitPrice) + ' ريال سعودي';
    d['remaining_text'] = this.toArabicWords(Math.max(0, unitPrice - firstPayment)) + ' ريال سعودي';
    for (let i = 0; i < 6; i++) {
      d[`p${i + 1}_amount`] = this.fmtAmt(unitPrice * INSTALL_PCT[i]);
      d[`p${i + 1}_date`] = baseDate ? this.fmt(this.addMonths(baseDate, INSTALL_MONTHS[i])) : '';
    }
    return d;
  }

  updatePreview() {
    if (!this.cTemplateFile || !this.cUnitPrice || !this.cFirstPayment || !this.cContractDate) {
      this.cShowPreview = false; return;
    }
    const up = parseFloat(this.cUnitPrice) || 0;
    const fp = parseFloat(this.cFirstPayment) || 0;
    const bd = this.parseISO(this.cContractDate);
    const res = this.computeReserved(up, fp, bd);
    const rows: PreviewRow[] = [
      { key: 'الكلمات العربية', value: '', isHeader: true },
      { key: '{{unit_price_text}}', value: res['unit_price_text'] },
      { key: '{{remaining_text}}', value: res['remaining_text'] },
      { key: 'جدول الأقساط', value: '', isHeader: true },
    ];
    for (let i = 1; i <= 6; i++) {
      rows.push({ key: `{{p${i}_amount}}`, value: res[`p${i}_amount`] });
      rows.push({ key: `{{p${i}_date}}`, value: res[`p${i}_date`] });
    }
    this.cPreviewRows = rows;
    this.cShowPreview = true;
  }

  // ── Contracts: generate ─────────────────────────────────────────────────────────
  async generateContract() {
    if (!this.cTemplateFile) return;
    this.cUnitPriceError = !this.cUnitPrice;
    this.cFirstPaymentError = this.cFirstPayment === '' || this.cFirstPayment === null || this.cFirstPayment === undefined;
    this.cContractDateError = !String(this.cContractDate).trim();
    this.cProjectError = !this.selectedProject;
    this.cDynamicFields.forEach(f => { f.error = !f.value.trim(); });
    const valid = !this.cUnitPriceError && !this.cFirstPaymentError && !this.cContractDateError
      && !this.cProjectError && this.cDynamicFields.every(f => !f.error);
    if (!valid) {
      const missing: string[] = [];
      if (this.cUnitPriceError) missing.push('سعر الوحدة');
      if (this.cFirstPaymentError) missing.push('الدفعة الأولى');
      if (this.cContractDateError) missing.push('تاريخ العقد');
      if (this.cProjectError) missing.push('المشروع');
      if (this.cDynamicFields.some(f => f.error)) missing.push('حقول القالب');
      this.toast.error('حقول فارغة: ' + missing.join(' · '));
      return;
    }

    this.cGenerating = true;
    try {
      const up = parseFloat(this.cUnitPrice) || 0;
      const fp = parseFloat(this.cFirstPayment) || 0;
      const bd = this.parseISO(this.cContractDate);
      const reserved = this.computeReserved(up, fp, bd);
      const dynamic: Record<string, string> = {};
      this.cDynamicFields.forEach(f => { dynamic[f.varName] = f.value.trim(); });
      const data = this.normalizeFields({ ...dynamic, ...reserved });

      // تطبيع الحقول الأساسية للحفظ في Supabase
      const savedFields = this.normalizeFields(dynamic);

      const templateBuf = await this.cTemplateFile.arrayBuffer();
      const fileLabel = [data['unit_code'], data['name']].filter(Boolean).map((s: string) => s.replace(/\s+/g, '_')).join('_') || 'عقد';

      if (this.cNotifFile) {
        // Pack contract + notifications into a single ZIP
        const notifBuf = await this.cNotifFile.arrayBuffer();
        const outputZip = new PizZip();
        outputZip.file(`عقد_${fileLabel}.docx`, this.renderDocx(templateBuf, data));
        for (let pi = 2; pi <= 6; pi++) {
          const notifData = { ...data, p_amount: reserved[`p${pi}_amount`], p_date: reserved[`p${pi}_date`], p_name: INSTALL_NAMES_AR[pi] };
          outputZip.file(`اشعار_الدفعة_${INSTALL_NAMES_AR[pi]}.docx`, this.renderDocx(notifBuf, notifData));
        }
        const zipBlob = outputZip.generate({ type: 'blob', mimeType: 'application/zip' });
        this.downloadBlob(zipBlob, `${fileLabel}.zip`);
      } else {
        const out = this.renderDocx(templateBuf, data);
        this.downloadBlob(new Blob([out], { type: DOCX_MIME }), `عقد_${fileLabel}.docx`);
      }

      // ── التحقق من التكرار ────────────────────────────────────────────────────
      const dup = await this.supa.checkDuplicate(
        this.selectedProject, dynamic['name'] || '', dynamic['unit_code'] || ''
      );
      if (dup) {
        this.toast.error(dup === 'name'
          ? 'العميل مسجّل مسبقاً في هذا المشروع'
          : 'رقم الوحدة مسجّل مسبقاً في هذا المشروع');
        this.cGenerating = false;
        return;
      }

      // ── حفظ في Supabase ──────────────────────────────────────────────────────
      this.cSaveStatus = 'saving';
      const projectName = this.selectedProject;
      const clientName = dynamic['name'] || '';
      const installments = Array.from({ length: 6 }, (_, i) => ({
        amount: parseFloat(reserved[`p${i + 1}_amount`].replace(/,/g, '')) || 0,
        dueDate: this.isoFromDisplay(reserved[`p${i + 1}_date`]),
      }));
      const result = await this.supa.saveContract({
        projectName,
        clientName,
        unitPrice: up,
        firstPayment: fp,
        contractDate: this.cContractDate,
        fields: savedFields,
        installments,
      });
      this.cSaveStatus = 'error' in result ? 'error' : 'saved';
      if ('error' in result) this.toast.error('تعذّر الحفظ في قاعدة البيانات: ' + result.error);
      setTimeout(() => { this.cSaveStatus = 'idle'; }, 3000);
    } catch (err: any) {
      this.toast.error('خطأ في معالجة القالب: ' + (err.message || err));
    }
    this.cGenerating = false;
  }

  private isoFromDisplay(display: string): string {
    if (!display) return '';
    // display format: DD/MM/YYYY
    const [d, m, y] = display.split('/');
    if (!d || !m || !y) return display;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // ── Contracts: notification template (for bulk) ─────────────────────────────────
  cNotifDragOver(e: DragEvent) { e.preventDefault(); this.cIsDragOverNotif = true; }
  cNotifDragLeave() { this.cIsDragOverNotif = false; }
  cNotifDrop(e: DragEvent) { e.preventDefault(); this.cIsDragOverNotif = false; const f = e.dataTransfer?.files[0]; if (f) this.handleNotifFile(f); }
  cNotifChange(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.handleNotifFile(f); }
  cClickNotif() { this.cNotifInputRef?.nativeElement.click(); }

  handleNotifFile(file: File) {
    if (!file.name.endsWith('.docx')) { this.toast.error('قالب الإشعارات يجب أن يكون .docx'); return; }
    this.cNotifFile = file; this.cNotifName = file.name;
  }

  clearNotifFile() { this.cNotifFile = null; this.cNotifName = ''; if (this.cNotifInputRef) this.cNotifInputRef.nativeElement.value = ''; }

  // ── Excel parsing ───────────────────────────────────────────────────────────────
  private parseExcel(file: File): Promise<{ rows: any[]; cols: string[] }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          const hi = raw.findIndex(r => r.some((c: any) => String(c).trim() !== ''));
          if (hi === -1) { resolve({ rows: [], cols: [] }); return; }
          const cols = raw[hi].map((h: any) => String(h).trim());
          const rows: any[] = [];
          for (let i = hi + 1; i < raw.length; i++) {
            const row = raw[i];
            if (row.every((c: any) => String(c).trim() === '')) continue;
            const obj: Record<string, string> = {};
            cols.forEach((col, ci) => { obj[col] = String(row[ci] ?? '').trim(); });
            rows.push(obj);
          }
          resolve({ rows, cols });
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Contracts: Excel upload ─────────────────────────────────────────────────────
  cExcelDragOver(e: DragEvent) { e.preventDefault(); this.cIsDragOverExcel = true; }
  cExcelDragLeave() { this.cIsDragOverExcel = false; }
  cExcelDrop(e: DragEvent) { e.preventDefault(); this.cIsDragOverExcel = false; const f = e.dataTransfer?.files[0]; if (f) this.handleContractExcel(f); }
  cExcelChange(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.handleContractExcel(f); }
  cClickExcel() { this.cExcelInputRef?.nativeElement.click(); }

  async handleContractExcel(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { this.toast.error('يرجى اختيار ملف Excel بصيغة .xlsx أو .xls'); return; }
    try {
      const { rows, cols } = await this.parseExcel(file);
      this.cExcelFile = file; this.cExcelName = file.name; this.cExcelRows = rows; this.cExcelCols = cols;
    } catch (err: any) { this.toast.error('خطأ في قراءة ملف Excel: ' + (err.message || err)); }
  }

  clearContractExcel() { this.cExcelFile = null; this.cExcelName = ''; this.cExcelRows = []; this.cExcelCols = []; if (this.cExcelInputRef) this.cExcelInputRef.nativeElement.value = ''; }

  // ── Contracts: bulk generation ──────────────────────────────────────────────────
  async bulkGenerate() {
    if (!this.selectedProject) {
      this.cProjectError = true;
      this.cError = 'اختر مشروعاً أولاً';
      this.toast.error('اختر مشروعاً أولاً');
      return;
    }
    if (!this.cTemplateFile || !this.cExcelRows.length) return;
    this.cBulkGenerating = true;
    try {
      const outputZip = new PizZip();
      const templateBuf = await this.cTemplateFile.arrayBuffer();
      const notifBuf = this.cNotifFile ? await this.cNotifFile.arrayBuffer() : null;
      const total = this.cExcelRows.length;

      const projectName = this.selectedProject;

      let skippedIncomplete = 0;
      for (let i = 0; i < total; i++) {
        const row = this.cExcelRows[i];
        const up = parseFloat(String(row['unit_price'] || '0').replace(/,/g, '')) || 0;
        const fp = parseFloat(String(row['first_payment'] || '0').replace(/,/g, '')) || 0;
        const bd = this.parseAnyDate(String(row['contract_date'] || ''));
        const dynamic: Record<string, string> = {};
        this.cDynamicFields.forEach(f => { dynamic[f.varName] = row[f.varName] !== undefined ? String(row[f.varName]).trim() : ''; });

        // ── تخطّي الصفوف الناقصة (اسم + سعر + تاريخ فقط) ──────────────────
        const clientName = String(row['name'] || dynamic['name'] || '').trim();
        if (!up || !bd || !clientName) {
          skippedIncomplete++;
          const miss = [!clientName && 'name', !up && 'unit_price', !bd && 'contract_date'].filter(Boolean).join('، ');
          this.cBulkStatus = `صف ${i + 1}/${total} — تخطّي (ناقص: ${miss})`;
          continue;
        }

        const reserved = this.computeReserved(up, fp, bd);
        const data = this.normalizeFields({ ...row, ...dynamic, ...reserved });

        const clientSlug = (data['name'] || '').replace(/\s+/g, '_');
        const unitCode = (data['unit_code'] || '').replace(/\s+/g, '_');
        const num = String(i + 1).padStart(3, '0');
        const label = [unitCode, clientSlug].filter(Boolean).join('_') || num;
        const folder = `${num}_${label}/`;

        // ── توليد العقد والإشعارات (دائماً بغضّ النظر عن التكرار) ────────────
        this.cBulkStatus = `عميل ${i + 1}/${total} — توليد العقد...`;
        outputZip.file(folder + `${num}_عقد_${label}.docx`, this.renderDocx(templateBuf, data));

        if (notifBuf) {
          for (let pi = 2; pi <= 6; pi++) {
            this.cBulkStatus = `عميل ${i + 1}/${total} — إشعار الدفعة ${INSTALL_NAMES_AR[pi]}...`;
            const notifData = { ...data, p_amount: reserved[`p${pi}_amount`], p_date: reserved[`p${pi}_date`], p_name: INSTALL_NAMES_AR[pi] };
            outputZip.file(folder + `اشعار_الدفعة_${INSTALL_NAMES_AR[pi]}.docx`, this.renderDocx(notifBuf, notifData));
          }
        }

        // ── التحقق من التكرار (للحفظ في Supabase فقط) ──────────────────────
        const dup = await this.supa.checkDuplicate(
          projectName, data['name'] || '', data['unit_code'] || ''
        );
        if (dup) {
          this.cBulkStatus = `عميل ${i + 1}/${total} — تخطّي (${dup === 'name' ? 'اسم مكرر' : 'وحدة مكررة'})`;
          continue;
        }

        // ── حفظ في Supabase ──────────────────────────────────────────────────
        this.cBulkStatus = `عميل ${i + 1}/${total} — حفظ الدفعات...`;
        const contractDateIso = bd
          ? `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`
          : '';
        const installments = Array.from({ length: 6 }, (_, idx) => ({
          amount: parseFloat(String(reserved[`p${idx + 1}_amount`] || '0').replace(/,/g, '')) || 0,
          dueDate: this.isoFromDisplay(reserved[`p${idx + 1}_date`]),
        }));
        const saveResult = await this.supa.saveContract({
          projectName,
          clientName: data['name'] || '',
          unitPrice: up,
          firstPayment: fp,
          contractDate: contractDateIso,
          fields: this.normalizeFields(dynamic, row),
          installments,
        });
        if ('error' in saveResult) {
          console.error(`[Supabase] عميل ${i + 1}:`, saveResult.error);
        }
      }

      const zipBlob = outputZip.generate({ type: 'blob', mimeType: 'application/zip' });
      const fname = notifBuf ? `عقود_واشعارات_${total}_عميل.zip` : `عقود_${total}_عميل.zip`;
      this.downloadBlob(zipBlob, fname);
      const processed = total - skippedIncomplete;
      this.cBulkStatus = skippedIncomplete > 0
        ? `✓ ${processed} عميل تم تنزيله — تخطّي ${skippedIncomplete} (بيانات ناقصة)`
        : `✓ ${total} عميل — تم التنزيل`;
      setTimeout(() => { this.cBulkStatus = ''; }, 5000);
    } catch (err: any) {
      this.toast.error('خطأ أثناء التوليد: ' + (err.message || err));
      this.cBulkStatus = '';
    }
    this.cBulkGenerating = false;
  }

  /** تطبيع أسماء الحقول الشائعة إلى مفاتيح إنجليزية موحّدة للحفظ في Supabase */
  private normalizeFields(src: Record<string, string>, extra?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { ...src, ...(extra ?? {}) };
    const pick = (keys: string[]) => keys.map(k => out[k] || '').find(Boolean) || '';
    if (!out['email'])     out['email']     = pick(['mail','الايميل','البريد','البريد_الالكتروني','client_email','e_mail']);
    if (!out['mail'])      out['mail']      = out['email'] || '';
    if (!out['unit_code']) out['unit_code'] = pick(['كود_الوحدة','رقم_الوحدة','unitcode','unit']);
    if (!out['phone'])     out['phone']     = pick(['الجوال','الهاتف','mobile','tel']);
    if (!out['name'])      out['name']      = pick(['اسم_العميل','client_name','الاسم']);
    return out;
  }

  private renderDocx(templateBuf: ArrayBuffer, data: Record<string, string>): Uint8Array {
    const zip = new PizZip(templateBuf.slice(0));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' } });
    doc.render(data);
    return doc.getZip().generate({ type: 'uint8array', mimeType: DOCX_MIME });
  }

  // ── Notifications: template upload ──────────────────────────────────────────────
  nDragOver(e: DragEvent) { e.preventDefault(); this.nIsDragOver = true; }
  nDragLeave() { this.nIsDragOver = false; }
  nDrop(e: DragEvent) { e.preventDefault(); this.nIsDragOver = false; const f = e.dataTransfer?.files[0]; if (f) this.handleNotifTemplate(f); }
  nFileChange(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.handleNotifTemplate(f); }
  nClickUpload() { this.nFileInputRef.nativeElement.click(); }

  async handleNotifTemplate(file: File) {
    if (!file.name.endsWith('.docx')) { this.toast.error('يرجى اختيار ملف Word بصيغة .docx'); return; }
    this.nTemplateFile = file; this.nTemplateName = file.name;
    try {
      this.nDynamicFields = this.toFields(await this.parseDocxVars(file, false));
    } catch (err: any) {
      this.toast.error('تعذّر قراءة القالب: ' + (err.message || err));
      this.nTemplateFile = null; this.nTemplateName = '';
    }
  }

  clearNotifTemplate() {
    this.nTemplateFile = null; this.nTemplateName = '';
    this.nDynamicFields = []; this.nExcelFile = null; this.nExcelRows = []; this.nExcelCols = []; this.nExcelName = '';
    this.nBulkStatus = '';
    if (this.nFileInputRef) this.nFileInputRef.nativeElement.value = '';
    if (this.nExcelInputRef) this.nExcelInputRef.nativeElement.value = '';
  }

  // ── Notifications: generate single ─────────────────────────────────────────────
  async generateNotif() {
    if (!this.nTemplateFile) return;
    let valid = true;
    this.nDynamicFields.forEach(f => { f.error = !f.value.trim(); if (f.error) valid = false; });
    if (!valid) { this.toast.error('يرجى تعبئة جميع الحقول المطلوبة'); return; }

    this.nGenerating = true;
    try {
      const data: Record<string, string> = {};
      this.nDynamicFields.forEach(f => { data[f.varName] = f.value.trim(); });
      const buf = await this.nTemplateFile.arrayBuffer();
      const zip = new PizZip(buf);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' } });
      doc.render(data);
      const out = doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME });
      const name = (data['name'] || data['اسم_العميل'] || 'اشعار').replace(/\s+/g, '_');
      this.downloadBlob(out, `اشعار_${name}.docx`);
    } catch (err: any) {
      this.toast.error('خطأ في معالجة القالب: ' + (err.message || err));
    }
    this.nGenerating = false;
  }

  // ── Notifications: Excel upload ─────────────────────────────────────────────────
  nExcelDragOver(e: DragEvent) { e.preventDefault(); this.nIsDragOverExcel = true; }
  nExcelDragLeave() { this.nIsDragOverExcel = false; }
  nExcelDrop(e: DragEvent) { e.preventDefault(); this.nIsDragOverExcel = false; const f = e.dataTransfer?.files[0]; if (f) this.handleNotifExcel(f); }
  nExcelChange(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.handleNotifExcel(f); }
  nClickExcel() { this.nExcelInputRef?.nativeElement.click(); }

  async handleNotifExcel(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { this.toast.error('يرجى اختيار ملف Excel بصيغة .xlsx أو .xls'); return; }
    try {
      const { rows, cols } = await this.parseExcel(file);
      this.nExcelFile = file; this.nExcelName = file.name; this.nExcelRows = rows; this.nExcelCols = cols;
    } catch (err: any) { this.toast.error('خطأ في قراءة ملف Excel: ' + (err.message || err)); }
  }

  clearNotifExcel() { this.nExcelFile = null; this.nExcelName = ''; this.nExcelRows = []; this.nExcelCols = []; if (this.nExcelInputRef) this.nExcelInputRef.nativeElement.value = ''; }

  // ── Notifications: bulk generation ─────────────────────────────────────────────
  async bulkGenerateNotif() {
    if (!this.nTemplateFile || !this.nExcelRows.length) return;
    this.nBulkGenerating = true;
    try {
      const outputZip = new PizZip();
      const templateBuf = await this.nTemplateFile.arrayBuffer();
      const total = this.nExcelRows.length;

      for (let i = 0; i < total; i++) {
        this.nBulkStatus = `جاري التوليد ${i + 1} / ${total}...`;
        const row = this.nExcelRows[i];
        const data: Record<string, string> = {};
        this.nDynamicFields.forEach(f => { data[f.varName] = row[f.varName] !== undefined ? String(row[f.varName]).trim() : ''; });
        const out = this.renderDocx(templateBuf, data);
        const clientName = (data['name'] || data['اسم_العميل'] || '').replace(/\s+/g, '_');
        const unitCode = (data['unit_code'] || data['كود_الوحدة'] || '').replace(/\s+/g, '_');
        const num = String(i + 1).padStart(3, '0');
        outputZip.file(`${num}_اشعار_${[unitCode, clientName].filter(Boolean).join('_') || 'عقد'}.docx`, out);
      }

      const zipBlob = outputZip.generate({ type: 'blob', mimeType: 'application/zip' });
      this.downloadBlob(zipBlob, `اشعارات_${total}_ملف.zip`);
      this.nBulkStatus = `✓ ${total} ملف — تم التنزيل`;
      setTimeout(() => { this.nBulkStatus = ''; }, 4000);
    } catch (err: any) {
      this.toast.error('خطأ أثناء التوليد: ' + (err.message || err));
      this.nBulkStatus = '';
    }
    this.nBulkGenerating = false;
  }

  // ── Utility ─────────────────────────────────────────────────────────────────────
  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
