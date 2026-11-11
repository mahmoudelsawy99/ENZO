import { Component, computed, input } from '@angular/core';
import type { IconName } from '../../core/icons/icon-name';

type Segment =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: string; cy: string; r: string }
  | { kind: 'rect'; x: string; y: string; width: string; height: string; rx?: string };

@Component({
  selector: 'enzo-icon',
  host: { class: 'inline-flex size-5 shrink-0' },
  template: `
    <svg
      class="size-full"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @for (segment of segments(); track $index) {
        @switch (segment.kind) {
          @case ('path') {
            <path [attr.d]="segment.d" />
          }
          @case ('circle') {
            <circle [attr.cx]="segment.cx" [attr.cy]="segment.cy" [attr.r]="segment.r" />
          }
          @case ('rect') {
            <rect
              [attr.x]="segment.x"
              [attr.y]="segment.y"
              [attr.width]="segment.width"
              [attr.height]="segment.height"
              [attr.rx]="segment.rx ?? null"
            />
          }
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly segments = computed(() => ICONS[this.name()] ?? ICONS.info);
}

const ICONS: Record<IconName, readonly Segment[]> = {
  dashboard: [
    { kind: 'rect', x: '3', y: '3', width: '7', height: '9', rx: '1' },
    { kind: 'rect', x: '14', y: '3', width: '7', height: '5', rx: '1' },
    { kind: 'rect', x: '14', y: '12', width: '7', height: '9', rx: '1' },
    { kind: 'rect', x: '3', y: '16', width: '7', height: '5', rx: '1' },
  ],
  calendar: [
    { kind: 'path', d: 'M8 2v4' },
    { kind: 'path', d: 'M16 2v4' },
    { kind: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2' },
    { kind: 'path', d: 'M3 10h18' },
  ],
  queue: [
    { kind: 'path', d: 'M8 6h13' },
    { kind: 'path', d: 'M8 12h13' },
    { kind: 'path', d: 'M8 18h13' },
    { kind: 'path', d: 'M3 6h.01' },
    { kind: 'path', d: 'M3 12h.01' },
    { kind: 'path', d: 'M3 18h.01' },
  ],
  users: [
    { kind: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { kind: 'circle', cx: '9', cy: '7', r: '4' },
    { kind: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { kind: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
  scissors: [
    { kind: 'circle', cx: '6', cy: '6', r: '3' },
    { kind: 'circle', cx: '6', cy: '18', r: '3' },
    { kind: 'path', d: 'M20 4 8.12 15.88' },
    { kind: 'path', d: 'm14.47 14.48 5.53 5.52' },
    { kind: 'path', d: 'M8.12 8.12 12 12' },
  ],
  package: [
    { kind: 'path', d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' },
    { kind: 'path', d: 'M12 22V12' },
    { kind: 'path', d: 'm3.3 7 8.7 5 8.7-5' },
  ],
  card: [
    { kind: 'rect', x: '2', y: '5', width: '20', height: '14', rx: '2' },
    { kind: 'path', d: 'M2 10h20' },
  ],
  receipt: [
    { kind: 'path', d: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z' },
    { kind: 'path', d: 'M8 7h8' },
    { kind: 'path', d: 'M8 11h8' },
    { kind: 'path', d: 'M8 15h5' },
  ],
  wallet: [
    { kind: 'path', d: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2' },
    { kind: 'path', d: 'M3 5v14a2 2 0 0 0 2 2h15v-5' },
  ],
  clock: [
    { kind: 'circle', cx: '12', cy: '12', r: '10' },
    { kind: 'path', d: 'M12 6v6l4 2' },
  ],
  leave: [
    { kind: 'path', d: 'M8 2v4' },
    { kind: 'path', d: 'M16 2v4' },
    { kind: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2' },
    { kind: 'path', d: 'M3 10h18' },
    { kind: 'path', d: 'm14 14-4 4' },
    { kind: 'path', d: 'm10 14 4 4' },
  ],
  banknote: [
    { kind: 'rect', x: '2', y: '6', width: '20', height: '12', rx: '2' },
    { kind: 'circle', cx: '12', cy: '12', r: '2' },
    { kind: 'path', d: 'M6 12h.01M18 12h.01' },
  ],
  boxes: [
    { kind: 'path', d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' },
    { kind: 'path', d: 'm3.3 7 8.7 5 8.7-5' },
    { kind: 'path', d: 'M12 22V12' },
  ],
  truck: [
    { kind: 'path', d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' },
    { kind: 'path', d: 'M15 18h2' },
    { kind: 'path', d: 'M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.24-.66l-2.7-3.22A1 1 0 0 0 18.3 9H14' },
    { kind: 'circle', cx: '17', cy: '18', r: '2' },
    { kind: 'circle', cx: '7', cy: '18', r: '2' },
  ],
  cart: [
    { kind: 'circle', cx: '8', cy: '21', r: '1' },
    { kind: 'circle', cx: '19', cy: '21', r: '1' },
    { kind: 'path', d: 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12' },
  ],
  building: [
    { kind: 'rect', x: '4', y: '2', width: '16', height: '20', rx: '2' },
    { kind: 'path', d: 'M9 22v-4h6v4' },
    { kind: 'path', d: 'M8 6h.01M12 6h.01M16 6h.01' },
    { kind: 'path', d: 'M8 10h.01M12 10h.01M16 10h.01' },
    { kind: 'path', d: 'M8 14h.01M12 14h.01M16 14h.01' },
  ],
  chart: [
    { kind: 'path', d: 'M3 3v16a2 2 0 0 0 2 2h16' },
    { kind: 'path', d: 'M18 17V9' },
    { kind: 'path', d: 'M13 17V5' },
    { kind: 'path', d: 'M8 17v-3' },
  ],
  shield: [
    { kind: 'path', d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
  ],
  settings: [
    { kind: 'circle', cx: '12', cy: '12', r: '3' },
    { kind: 'path', d: 'M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56' },
  ],
  menu: [
    { kind: 'path', d: 'M4 6h16' },
    { kind: 'path', d: 'M4 12h16' },
    { kind: 'path', d: 'M4 18h16' },
  ],
  bell: [
    { kind: 'path', d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' },
    { kind: 'path', d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' },
  ],
  sun: [
    { kind: 'circle', cx: '12', cy: '12', r: '4' },
    { kind: 'path', d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' },
  ],
  moon: [{ kind: 'path', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  globe: [
    { kind: 'circle', cx: '12', cy: '12', r: '10' },
    { kind: 'path', d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' },
    { kind: 'path', d: 'M2 12h20' },
  ],
  'chevron-down': [{ kind: 'path', d: 'm6 9 6 6 6-6' }],
  'chevron-left': [{ kind: 'path', d: 'm15 18-6-6 6-6' }],
  'chevron-right': [{ kind: 'path', d: 'm9 18 6-6-6-6' }],
  search: [
    { kind: 'circle', cx: '11', cy: '11', r: '8' },
    { kind: 'path', d: 'm21 21-4.3-4.3' },
  ],
  x: [
    { kind: 'path', d: 'M18 6 6 18' },
    { kind: 'path', d: 'm6 6 12 12' },
  ],
  check: [{ kind: 'path', d: 'M20 6 9 17l-5-5' }],
  eye: [
    { kind: 'path', d: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0' },
    { kind: 'circle', cx: '12', cy: '12', r: '3' },
  ],
  'eye-off': [
    { kind: 'path', d: 'M10.73 5.08A10.74 10.74 0 0 1 21.94 11.65a1 1 0 0 1 0 .7 10.8 10.8 0 0 1-1.44 2.49' },
    { kind: 'path', d: 'M14.08 14.16a3 3 0 0 1-4.24-4.24' },
    { kind: 'path', d: 'M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14' },
    { kind: 'path', d: 'm2 2 20 20' },
  ],
  info: [
    { kind: 'circle', cx: '12', cy: '12', r: '10' },
    { kind: 'path', d: 'M12 16v-4' },
    { kind: 'path', d: 'M12 8h.01' },
  ],
  alert: [
    { kind: 'circle', cx: '12', cy: '12', r: '10' },
    { kind: 'path', d: 'M12 8v4' },
    { kind: 'path', d: 'M12 16h.01' },
  ],
  panel: [
    { kind: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2' },
    { kind: 'path', d: 'M9 3v18' },
  ],
  logout: [
    { kind: 'path', d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
    { kind: 'path', d: 'm16 17 5-5-5-5' },
    { kind: 'path', d: 'M21 12H9' },
  ],
  user: [
    { kind: 'path', d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' },
    { kind: 'circle', cx: '12', cy: '7', r: '4' },
  ],
  inbox: [
    { kind: 'path', d: 'M22 12h-6l-2 3h-4l-2-3H2' },
    { kind: 'path', d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' },
  ],
};
