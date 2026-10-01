import { describe, expect, it } from "vitest";
import { CommandHistory, type Command } from "./command-history";

interface CounterState {
  value: number;
}

function increment(by: number): Command<CounterState> {
  return {
    label: `+${by}`,
    apply: (state) => ({ value: state.value + by }),
    undo: (state) => ({ value: state.value - by }),
  };
}

describe("CommandHistory", () => {
  it("applies a command and updates state", () => {
    const history = new CommandHistory<CounterState>({ value: 0 });
    history.do(increment(5));
    expect(history.getState()).toEqual({ value: 5 });
  });

  it("undoes the last command", () => {
    const history = new CommandHistory<CounterState>({ value: 0 });
    history.do(increment(5));
    history.do(increment(3));
    expect(history.getState()).toEqual({ value: 8 });
    history.undo();
    expect(history.getState()).toEqual({ value: 5 });
  });

  it("redoes an undone command", () => {
    const history = new CommandHistory<CounterState>({ value: 0 });
    history.do(increment(5));
    history.undo();
    expect(history.getState()).toEqual({ value: 0 });
    history.redo();
    expect(history.getState()).toEqual({ value: 5 });
  });

  it("discards the redo branch once a new command is applied after undo", () => {
    const history = new CommandHistory<CounterState>({ value: 0 });
    history.do(increment(5));
    history.undo();
    history.do(increment(10));
    expect(history.getState()).toEqual({ value: 10 });
    expect(history.canRedo()).toBe(false);
    // redo is a no-op once the branch is gone
    history.redo();
    expect(history.getState()).toEqual({ value: 10 });
  });

  it("undo/redo are no-ops on an empty stack", () => {
    const history = new CommandHistory<CounterState>({ value: 0 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    history.undo();
    history.redo();
    expect(history.getState()).toEqual({ value: 0 });
  });

  it("reports undo/redo labels in application order", () => {
    const history = new CommandHistory<CounterState>({ value: 0 });
    history.do(increment(1));
    history.do(increment(2));
    expect(history.undoLabels()).toEqual(["+1", "+2"]);
    history.undo();
    expect(history.undoLabels()).toEqual(["+1"]);
    expect(history.redoLabels()).toEqual(["+2"]);
  });

  it("evicts the oldest undo entry once maxEntries is exceeded", () => {
    const history = new CommandHistory<CounterState>({ value: 0 }, { maxEntries: 2 });
    history.do(increment(1));
    history.do(increment(2));
    history.do(increment(3));
    expect(history.undoLabels()).toEqual(["+2", "+3"]);
    expect(history.getState()).toEqual({ value: 6 });
    // the evicted "+1" command can no longer be undone
    history.undo();
    history.undo();
    expect(history.canUndo()).toBe(false);
    expect(history.getState()).toEqual({ value: 1 });
  });

  it("does not mutate the state object in place", () => {
    const initial: CounterState = { value: 0 };
    const history = new CommandHistory<CounterState>(initial);
    history.do(increment(5));
    expect(initial).toEqual({ value: 0 });
  });
});
