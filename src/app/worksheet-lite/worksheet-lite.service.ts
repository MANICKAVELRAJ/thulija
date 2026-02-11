import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import * as XLSX from 'xlsx';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';

/* ================= CHART ================= */
export interface ChartItem {
  id: number;
  name: string;
  type: string;
  image?: string;
  x?: number;
  y?: number;
  zIndex?: number;
  width?: number;
  height?: number;
  isXYEnabled?: boolean;
  /* ===== DATA BINDING ===== */
  /* 🔥 DATA */
  tableId?: number;        // 🔥 ADD THIS
  tableName?: string;      // appendixe
  fields?: string[];
  data?: any[];
  valueField?: string
  xField?: string;
  yField?: string;


  xFieldId?: number;
  yFieldId?: number;

  xFieldValue?: string;
  yFieldValue?: string;
}
/* ================= PAGE ================= */
export interface PageItem {
  id: number;
  page_name: string;
  table_name: string;
}


@Injectable({ providedIn: 'root' })
export class WorksheetLiteService {

  /* ================= DATA ================= */
  chartTypes: ChartItem[] = [];
  canvasCharts: ChartItem[] = [];

  /* ================= WORKFLOW ================= */
  private workflowFieldsSubject = new BehaviorSubject<string[]>([]);
  workflowFields$ = this.workflowFieldsSubject.asObservable();

  /* ================= FIELDS.JSON ================= */
  private fieldsSubject = new BehaviorSubject<any[]>([]);
  fields$ = this.fieldsSubject.asObservable();

  get allFields(): any[] {
    return this.fieldsSubject.value;
  }

  /* ================= CANVAS ================= */
  nextId = 1000;
  zIndexCounter = 10;

  canvasEl!: HTMLElement;
  movingIndex: number | null = null;
  offsetX = 0;
  offsetY = 0;

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {
    this.loadWorkflow();
    this.loadFields();
    this.loadPages();
  }

  /* ================= INIT ================= */
  initCanvas(el: HTMLElement): void {
    this.canvasEl = el;
  }
  /* ================= LOAD FIELDS.JSON ================= */
  loadFields(): void {
    this.http.get<any[]>('assets/fields.json')
      .subscribe(res => {
        if (Array.isArray(res)) {
          this.fieldsSubject.next(res);
          console.log('Fields.json:', res);
        } else {
          this.fieldsSubject.next([]);
        }
      });
  }

  /* ================= LOAD PAGES.JSON ================= */
  private pagesSubject = new BehaviorSubject<PageItem[]>([]);
  pages$ = this.pagesSubject.asObservable();

  loadPages(): void {
    this.http.get<PageItem[]>('assets/pages.json')
      .subscribe(res => {
        if (Array.isArray(res) && res.length > 0) {
          this.pagesSubject.next(res);
          console.log('Pages.json loaded:', res);
        } else {
          this.pagesSubject.next([]);
        }
      });
  }


  /* ================= LOAD CHARTS ================= */
  loadCharts(): Promise<ChartItem[]> {
    return this.http
      .get<ChartItem[]>('assets/chart.json')
      .toPromise()
      .then(res => {
        this.chartTypes = res || [];
        return this.chartTypes;
      });
  }

  /* ================= LOAD WORKFLOW (FIXED) ================= */
  loadWorkflow(): void {
    this.http.get<any[]>('assets/workflowprocess.json')
      .subscribe(res => {

        if (!Array.isArray(res) || res.length === 0) {
          this.workflowFieldsSubject.next([]);
          return;
        }

        // 🔥 extract keys from first object
        const fields = Object.keys(res[0]);

        this.workflowFieldsSubject.next(fields);
        console.log('Workflow Fields:', fields);
      });
  }
  /* ================= DROP ================= */
  dropOnCanvas(event: CdkDragDrop<any>): void {
    if (event.previousContainer.id !== 'chartList') return;

    const draggedChart = event.item.data as ChartItem;
    const rect = this.canvasEl.getBoundingClientRect();
    const mouse = event.event as MouseEvent;

    const width = 180;
    const height = 140;

    let x = mouse.clientX - rect.left - width / 2;
    let y = mouse.clientY - rect.top - height / 2;

    [x, y] = this.findFreePosition(x, y, width, height);

    this.canvasCharts.push({
      ...draggedChart,
      id: this.nextId++,
      x,
      y,
      width,
      height,
      zIndex: ++this.zIndexCounter
    });
  }


  /* ================= OVERLAP ================= */
  findFreePosition(
    x: number,
    y: number,
    width: number,
    height: number,
    ignoreIndex: number | null = null
  ): [number, number] {

    const padding = 16;

    x = Math.max(0, Math.min(x, this.canvasEl.clientWidth - width));
    y = Math.max(0, Math.min(y, this.canvasEl.clientHeight - height));

    for (let i = 0; i < 200; i++) {
      let overlap = false;

      for (let j = 0; j < this.canvasCharts.length; j++) {
        if (ignoreIndex === j) continue;

        const c = this.canvasCharts[j];
        const hit = !(
          x + width + padding < c.x! ||
          x > c.x! + c.width! + padding ||
          y + height + padding < c.y! ||
          y > c.y! + c.height! + padding
        );

        if (hit) {
          overlap = true;
          x += padding;
          y += padding;
          break;
        }
      }
      if (!overlap) break;
    }
    return [x, y];
  }

  /* ================= MOVE ================= */
  startMove(event: MouseEvent, index: number): void {
    this.movingIndex = index;
    const item = this.canvasCharts[index];
    item.zIndex = ++this.zIndexCounter;
    this.offsetX = event.offsetX;
    this.offsetY = event.offsetY;
  }

  moveItem(event: MouseEvent): void {
    if (this.movingIndex === null) return;

    const rect = this.canvasEl.getBoundingClientRect();
    const item = this.canvasCharts[this.movingIndex];

    item.x = Math.max(
      0,
      Math.min(
        event.clientX - rect.left - this.offsetX,
        this.canvasEl.clientWidth - item.width!
      )
    );

    item.y = Math.max(
      0,
      Math.min(
        event.clientY - rect.top - this.offsetY,
        this.canvasEl.clientHeight - item.height!
      )
    );
  }

  stopMove(): void {
    if (this.movingIndex === null) return;

    const item = this.canvasCharts[this.movingIndex];
    const [x, y] = this.findFreePosition(
      item.x!,
      item.y!,
      item.width!,
      item.height!,
      this.movingIndex
    );

    item.x = x;
    item.y = y;
    this.movingIndex = null;
  }

  /* ================= SVG MAP ================= */
  chartSvgMap: Record<string, string> = {

    bar: `
    <svg viewBox="0 0 24 24">
      <rect x="2" y="2" width="21" height="6" fill="#1e88e5"/>
      <rect x="2" y="10" width="15" height="6" fill="#1e88e5"/>
      <rect x="2" y="18" width="9" height="6" fill="#1e88e5"/>
    </svg>
`,

    column: `
    <svg viewBox="0 0 24 24">
      <rect x="2" y="3" width="6" height="21" fill="#1e88e5"/>
      <rect x="10" y="9" width="6" height="15" fill="#1e88e5"/>
      <rect x="18" y="15" width="6" height="9" fill="#1e88e5"/>
    </svg>
`,

    stackedBar: `
    <svg viewBox="0 0 24 24">
      <rect x="0" y="2" width="5" height="4" fill="#1565c0"/>
      <rect x="5" y="2" width="6" height="4" fill="#1e88e5"/>
      <rect x="11" y="2" width="7" height="4" fill="#42a5f5"/>

      <rect x="0" y="8" width="10" height="4" fill="#1565c0"/>
      <rect x="10" y="8" width="8" height="4" fill="#1e88e5"/>
      <rect x="18" y="8" width="6" height="4" fill="#42a5f5"/>

      <rect x="0" y="14" width="6" height="4" fill="#1565c0"/>
      <rect x="6" y="14" width="9" height="4" fill="#1e88e5"/>
      <rect x="15" y="14" width="6" height="4" fill="#42a5f5"/>
  </svg>`,

    stackedColumn: `
    <svg viewBox="0 0 24 24">
      <rect x="2" y="19" width="4" height="5" fill="#1565c0"/>
      <rect x="2" y="13" width="4" height="6" fill="#1e88e5"/>
      <rect x="2" y="6" width="4" height="7" fill="#42a5f5"/>

      <rect x="8" y="14" width="4" height="10" fill="#1565c0"/>
      <rect x="8" y="6" width="4" height="8" fill="#1e88e5"/>
      <rect x="8" y="0" width="4" height="6" fill="#42a5f5"/>

      <rect x="14" y="18" width="4" height="6" fill="#1565c0"/>
      <rect x="14" y="9" width="4" height="9" fill="#1e88e5"/>
      <rect x="14" y="3" width="4" height="6" fill="#42a5f5"/>
    </svg>`,
    // ===== LINE CHART =====
    line: `
    <svg viewBox="0 0 24 24">
      <polyline points="2,18 6,10 10,14 14,6 18,12 22,4"
                fill="none"
                stroke="#1e88e5"
                stroke-width="2"/>
    </svg>`,

    // ===== AREA CHART =====
    area: `
    <svg viewBox="0 0 24 24">
      <polygon points="2,18 6,10 10,14 14,6 18,12 22,4 22,18 2,18"
               fill="#1e88e5" fill-opacity="0.5"/>
      <polyline points="2,18 6,10 10,14 14,6 18,12 22,4"
                fill="none"
                stroke="#1e88e5"
                stroke-width="2"/>
    </svg>`,

    // ===== STACKED AREA CHART =====
    stackedArea: `
    <svg viewBox="0 0 24 24">
      <polygon points="2,18 6,12 10,16 14,8 18,14 22,6 22,18 2,18"
               fill="#1565c0" fill-opacity="0.5"/>
      <polygon points="2,18 6,14 10,18 14,10 18,16 22,8 22,18 2,18"
               fill="#1e88e5" fill-opacity="0.5"/>
      <polyline points="2,18 6,12 10,16 14,8 18,14 22,6"
                fill="none"
                stroke="#1e88e5"
                stroke-width="2"/>
    </svg>`,

    // ===== PIE CHART =====
    pie: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">

  <!-- DEFINITIONS -->
  <defs>
    <linearGradient id="blueGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d47a1"/>
      <stop offset="100%" stop-color="#1976d2"/>
    </linearGradient>

    <linearGradient id="blueGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1565c0"/>
      <stop offset="100%" stop-color="#42a5f5"/>
    </linearGradient>

    <linearGradient id="blueGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e88e5"/>
      <stop offset="100%" stop-color="#90caf9"/>
    </linearGradient>
  </defs>
  <path d="M12 12 L12 2 A10 10 0 0 1 21.5 15 Z"
        fill="url(#blueGrad1)"/>
  <path d="M12 12 L21.5 15 A10 10 0 0 1 7 21 Z"
        fill="url(#blueGrad2)"/>
  <path d="M12 12 L7 21 A10 10 0 0 1 12 2 Z"
        fill="url(#blueGrad3)"/>

</svg>
`,
  };

  /* ================= SVG RETURN (SANITIZED) ================= */
  getChartSvg(type?: string): SafeHtml {
    if (!type) return '';
    const svg = this.chartSvgMap[type] || '';
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /* ================= HELPERS ================= */
  removeChart(id: number): void {
    this.canvasCharts = this.canvasCharts.filter(c => c.id !== id);
  }

  /* ================= FILE UPLOAD (UNCHANGED) ================= */
  uploadFile(file: File, progressCallback: (v: number) => void): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!file) return reject('No file selected');
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        progressCallback(progress);
        if (progress >= 100) {
          clearInterval(interval);
          this.readFile(file).then(resolve).catch(reject);
        }
      }, 300);
    });
  }

  readFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            resolve(JSON.parse((e.target as any).result));
          } catch {
            reject('Invalid JSON');
          }
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = e => {
          const wb = XLSX.read((e.target as any).result, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet));
        };
        reader.readAsBinaryString(file);
      }
    });
  }
}
