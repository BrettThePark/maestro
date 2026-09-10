import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MinimizedStrip } from "../MinimizedStrip";
import { useSessionStore, type SessionConfig } from "@/stores/useSessionStore";
import { useReviewStore } from "@/stores/useReviewStore";

function session(id: number, name: string | null): SessionConfig {
  return {
    id,
    mode: "Claude",
    name,
    branch: null,
    status: "Idle",
    worktree_path: null,
    project_path: "/repo",
  };
}

beforeEach(() => {
  useSessionStore.setState({ sessions: [session(1, "deploy"), session(2, null)] });
  useReviewStore.setState({ unreviewed: new Set<number>() });
});

describe("MinimizedStrip", () => {
  it("renders nothing when no session is minimized", () => {
    const { container } = render(<MinimizedStrip slots={[]} onRestore={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a session's name", () => {
    render(
      <MinimizedStrip slots={[{ slotId: "s1", sessionId: 1 }]} onRestore={() => {}} />,
    );
    expect(screen.getByText("deploy")).toBeTruthy();
  });

  it("falls back to the session number when unnamed", () => {
    render(
      <MinimizedStrip slots={[{ slotId: "s2", sessionId: 2 }]} onRestore={() => {}} />,
    );
    expect(screen.getByText("Session 2")).toBeTruthy();
  });

  it("restores the slot when its tab is clicked", () => {
    const onRestore = vi.fn();
    render(
      <MinimizedStrip slots={[{ slotId: "s1", sessionId: 1 }]} onRestore={onRestore} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /restore deploy/i }));
    expect(onRestore).toHaveBeenCalledWith("s1");
  });

  it("marks a session that finished unseen while minimized", () => {
    useReviewStore.setState({ unreviewed: new Set([1]) });
    render(
      <MinimizedStrip slots={[{ slotId: "s1", sessionId: 1 }]} onRestore={() => {}} />,
    );
    expect(screen.getByLabelText("Has unseen output")).toBeTruthy();
  });
});
