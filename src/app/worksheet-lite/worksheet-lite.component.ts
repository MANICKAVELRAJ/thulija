import {
  Component,
  OnInit,
  AfterViewInit,
  HostListener
} from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  WorksheetLiteService,
  ChartItem,
  PageItem
} from './worksheet-lite.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-worksheet-lite',
  templateUrl: './worksheet-lite.component.html',
  styleUrls: ['./worksheet-lite.component.css']
})
export class WorksheetLiteComponent implements OnInit, AfterViewInit {

  /* ================= SIDEBAR ================= */
  isSidebarCollapsed = false;

  /* ================= FILE UPLOAD ================= */
  uploadProgress = 0;
  uploadedData: any[] = [];

  /* ================= WORKFLOW ================= */
  defaultWorkflowFields: string[] = [];
  isCustomDataUploaded = false;

  /* ================= PROPERTY PANEL ================= */
  propertyPanelOpen = false;
  selectedItem: ChartItem | null = null;
  editableItem: ChartItem | null = null;
  originalSnapshot: ChartItem | null = null;

  pages: PageItem[] = [];
  pageTableFields: string[] = [];

  /* ================= X / Y FIELD UI STATE ================= */
  filteredFields: any[] = [];

  xFieldDisplayValue: string = '';
  yFieldDisplayValue: string = '';
  isXYEnabled = false;   // 🔥 initially disabled


  constructor(public service: WorksheetLiteService,
    private snackBar: MatSnackBar
  ) { }

  /* ================= INIT ================= */
  ngOnInit(): void {
    this.service.loadCharts();
    this.service.loadWorkflow();

    this.service.workflowFields$.subscribe(fields => {
      this.defaultWorkflowFields = fields;
    });

    // 🔥 pages.json → keys only
    this.service.pages$.subscribe(pages => {
      this.pages = pages || []; // 🔥 Store for local usage
      if (pages && pages.length > 0) {

        // 🔥 extract table_name values
        this.pageTableFields = pages
          .map(p => p.table_name)
          .filter((v, i, a) => a.indexOf(v) === i); // unique

        console.log('Table Names:', this.pageTableFields);
      } else {
        this.pageTableFields = [];
      }
    });
  }

  ngAfterViewInit(): void {
    const canvas = document.querySelector('.worksheet') as HTMLElement;
    if (canvas) {
      this.service.initCanvas(canvas);
    }
  }

  /* ================= CANVAS ================= */
  dropOnCanvas(event: CdkDragDrop<any>): void {

    // 🔥 existing service drop logic (unchanged)
    this.service.dropOnCanvas(event);

    // 🔥 last dropped chart
    const lastChart =
      this.service.canvasCharts[this.service.canvasCharts.length - 1];

    // 🔥 open property panel immediately
    if (lastChart) {
      this.openPropertyPanel(lastChart);
    }
  }

  startMove(event: MouseEvent, index: number): void {
    this.service.startMove(event, index);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    this.service.moveItem(event);
  }

  @HostListener('document:mouseup')
  stopMove(): void {
    this.service.stopMove();
  }

  /* ================= PROPERTY PANEL ================= */
  checkOverlapLive(item: ChartItem): void {
    if (!item) return;

    // Find the index of this chart in the canvasCharts array
    const index = this.service.canvasCharts.findIndex(c => c.id === item.id);
    if (index === -1) return;

    // Call the service method to adjust position if overlapping
    const [newX, newY] = this.service.findFreePosition(
      item.x ?? 0,
      item.y ?? 0,
      item.width ?? 0,
      item.height ?? 0,
      index
    );

    item.x = newX;
    item.y = newY;
  }
  onTableSelect(tableValue: string): void {
    const tableId = +tableValue;

    if (!this.editableItem || !tableId) return;

    const page = this.pages.find(p => p.id == tableId);
    if (!page) return;

    this.editableItem.tableId = +page.id;
    this.editableItem.tableName = page.table_name;

    // Filter data for this table
    const tableData = this.service.allFields.filter(
      f => f.page_id == page.id
    );
    this.editableItem.data = tableData;

    // Use keys of the first record as field options (Schema Keys)
    if (tableData.length > 0) {
      this.editableItem.fields = Object.keys(tableData[0]);
    } else {
      this.editableItem.fields = [];
    }

    // ✅ ENABLE HERE
    this.editableItem.isXYEnabled = true;

    this.editableItem.xField = '';
    this.editableItem.yField = '';
  }

  onXFieldChange(fieldName: string) {
    if (!this.editableItem) return;
    this.editableItem.xField = fieldName;
    this.xFieldDisplayValue = fieldName;
    this.autoResizeItem(this.editableItem);
  }

  onYFieldChange(fieldName: string) {
    if (!this.editableItem) return;
    this.editableItem.yField = fieldName;
    this.yFieldDisplayValue = fieldName;
    this.autoResizeItem(this.editableItem);
  }

  autoResizeItem(item: ChartItem): void {
    if (!item.data || item.data.length === 0) {
      item.width = 150;
      item.height = 150;
      return;
    }

    if (!item.xField && !item.yField) {
      item.width = 150;
      item.height = 150;
      return;
    }

    const xValues = item.xField ? item.data.map(row => String(row[item.xField!] || '')) : [];
    const yValues = item.yField ? item.data.map(row => String(row[item.yField!] || '')) : [];

    // Find longest string to set width
    const allVals = [...xValues, ...yValues];
    const maxChars = allVals.reduce((max, cur) => Math.max(max, cur.length), 0);

    // Width: chars * 8px + labels and padding
    const estimatedWidth = Math.max(160, (maxChars * 8) + 60);

    // Height: number of records * 25px + headers and padding
    const recordCount = item.data.length;
    let estimatedHeight = 40; // Base padding
    if (item.xField) estimatedHeight += (recordCount * 22) + 25; // values + header
    if (item.yField) estimatedHeight += (recordCount * 22) + 25; // values + header

    item.width = estimatedWidth;
    item.height = Math.max(100, estimatedHeight);
  }
  openPropertyPanel(chart: ChartItem): void {

    this.isCustomDataUploaded = false;
    this.isXYEnabled = false;

    this.selectedItem = chart;
    this.originalSnapshot = JSON.parse(JSON.stringify(chart));

    this.editableItem = {
      ...chart,
      x: Math.round(chart.x ?? 0),
      y: Math.round(chart.y ?? 0),
      width: Math.round(chart.width ?? 0),
      height: Math.round(chart.height ?? 0)
    };

    // 🔥 RESTORE STATE
    if (this.editableItem.data && this.editableItem.data.length > 0) {
      // Restore fields from existing data
      this.editableItem.fields = Object.keys(this.editableItem.data[0]);
      this.editableItem.isXYEnabled = true;

      // Restore display values
      this.xFieldDisplayValue = this.editableItem.xField || '';
      this.yFieldDisplayValue = this.editableItem.yField || '';

    } else if (this.editableItem.tableId) {
      // Restore from Table ID if data missing but ID exists
      const page = this.pages.find(p => p.id === this.editableItem!.tableId);
      if (page) {
        const tableData = this.service.allFields.filter(f => f.page_id == page.id);
        this.editableItem.data = tableData;

        if (tableData.length > 0) {
          this.editableItem.fields = Object.keys(tableData[0]);
        }
        this.editableItem.isXYEnabled = true;
        this.xFieldDisplayValue = this.editableItem.xField || '';
        this.yFieldDisplayValue = this.editableItem.yField || '';
      }
    } else {
      // First time or empty
      this.editableItem.fields = [];
      this.filteredFields = [];
      this.xFieldDisplayValue = '';
      this.yFieldDisplayValue = '';
    }

    this.propertyPanelOpen = true;
  }

  saveChanges(): void {
    if (!this.selectedItem || !this.editableItem) return;

    // Check overlap and adjust position if necessary
    const index = this.service.canvasCharts.findIndex(
      c => c.id === this.selectedItem!.id
    );

    if (index !== -1) {
      const [x, y] = this.service.findFreePosition(
        this.editableItem.x!,
        this.editableItem.y!,
        this.editableItem.width!,
        this.editableItem.height!,
        index
      );

      this.editableItem.x = x;
      this.editableItem.y = y;
    }

    // Save all properties (including data, fields, xField, yField)
    Object.assign(this.selectedItem, this.editableItem);
    this.cleanupPropertyPanel();
  }

  cancelChanges(): void {
    if (this.selectedItem && this.originalSnapshot) {
      Object.assign(this.selectedItem, this.originalSnapshot);
    }
    this.cleanupPropertyPanel();
  }

  cleanupPropertyPanel(): void {
    this.propertyPanelOpen = false;
    this.selectedItem = null;
    this.editableItem = null;
    this.originalSnapshot = null;
    this.uploadProgress = 0;
  }

  removeChart(id: number): void {
    this.service.removeChart(id);
    if (this.selectedItem?.id === id) {
      this.cleanupPropertyPanel();
    }
  }

  /* ================= FILE UPLOAD ================= */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.uploadProgress = 0;

    this.service.uploadFile(file, p => {
      this.uploadProgress = p;
    })
      .then(data => {

        // 🔥 MAIN LOGIC
        this.isCustomDataUploaded = true;

        if (this.editableItem) {
          this.editableItem.data = data;
          this.setFieldsForSelectedChart(data);
        }

        // ✅ Set to 100 to trigger success animation
        this.uploadProgress = 100;

        // auto hide progress after animation
        setTimeout(() => {
          this.uploadProgress = 0;
        }, 2000);
      });
  }
  /* ================= FIELD EXTRACTION ================= */
  setFieldsForSelectedChart(data: any[]): void {
    if (!data || data.length === 0 || !this.editableItem) return;

    const fields = Object.keys(data[0]);

    this.editableItem.fields = fields;

    // reset selections
    this.editableItem.valueField = '';
    this.editableItem.xField = '';
    this.editableItem.yField = '';
  }

  /* ================= SIDEBAR ================= */
  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }
}
