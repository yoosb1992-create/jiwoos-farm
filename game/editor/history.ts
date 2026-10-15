export class EditorHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private readonly clone: (value: T) => T, private readonly limit = 75) {}
  push(previous: T) {
    this.past.push(this.clone(previous));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T) {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(this.clone(current));
    return this.clone(previous);
  }
  redo(current: T) {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.clone(current));
    return this.clone(next);
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; }
}
