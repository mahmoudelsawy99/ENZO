import { Injectable, computed, signal } from '@angular/core';

export interface BranchOption {
  id: string;
  label: string;
}

const STORAGE_KEY = 'enzo.branch';

/**
 * The branch shown in the shell. It is a display preference.
 * Authorization always comes from the API.
 */
@Injectable({ providedIn: 'root' })
export class BranchContext {
  readonly branches = signal<BranchOption[]>([]);
  readonly selectedId = signal('');
  readonly selected = computed(
    () => this.branches().find((branch) => branch.id === this.selectedId()) ?? this.branches()[0] ?? { id: '', label: '' },
  );

  replace(branches: BranchOption[]): void {
    this.branches.set(branches);
    const stored = this.readStored();
    const match = branches.find((branch) => branch.id === stored) ?? branches[0];
    this.selectedId.set(match?.id ?? '');
    if (match) {
      this.persist(match.id);
    }
  }

  select(id: string): void {
    if (!this.branches().some((branch) => branch.id === id)) {
      return;
    }
    this.selectedId.set(id);
    this.persist(id);
  }

  private persist(id: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // The switcher still works for this visit.
    }
  }

  private readStored(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }
}
