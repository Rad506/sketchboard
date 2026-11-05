import type { BoardDoc } from './board';
import type { BoardObject } from './types';

export type Change = { add: BoardObject[]; remove: BoardObject[] };

export class History {
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];

  constructor(private doc: BoardDoc, private limit = 100) {}

  private run(c: Change): void {
    for (const o of c.remove) this.doc.remove(o.id);
    for (const o of c.add) this.doc.add(o);
  }

  private push(c: Change): void {
    this.undoStack.push(c);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Mutates the doc and records the change. */
  apply(c: Change): void {
    this.run(c);
    this.push(c);
  }

  /** Records a change whose effect is already in the doc (no mutation). */
  record(c: Change): void {
    this.push(c);
  }

  undo(): boolean {
    const c = this.undoStack.pop();
    if (!c) return false;
    this.run({ add: c.remove, remove: c.add });
    this.redoStack.push(c);
    return true;
  }

  redo(): boolean {
    const c = this.redoStack.pop();
    if (!c) return false;
    this.run(c);
    this.undoStack.push(c);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
