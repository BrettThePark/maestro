import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { PreLaunchCard, type SessionSlot } from "../PreLaunchCard";

vi.mock("@/lib/terminal", () => ({
  listClaudeSessions: vi.fn().mockResolvedValue([]),
  deleteClaudeSession: vi.fn().mockResolvedValue(undefined),
}));

describe("PreLaunchCard restore notes", () => {
  const makeSlot = (overrides?: Partial<SessionSlot>): SessionSlot => ({
    id: "slot-1",
    mode: "Claude",
    branch: null,
    worktreeMode: "project",
    sessionId: null,
    worktreePath: null,
    worktreeWarning: null,
    enabledMcpServers: [],
    enabledSkills: [],
    enabledPlugins: [],
    ...overrides,
  });

  const defaultProps = {
    projectPath: "/tmp/test-repo",
    branches: [{ name: "main", isRemote: false, isCurrent: true, hasWorktree: false }],
    isLoadingBranches: false,
    isGitRepo: true,
    mcpServers: [],
    skills: [],
    plugins: [],
    onModeChange: vi.fn(),
    onBranchChange: vi.fn(),
    onMcpToggle: vi.fn(),
    onSkillToggle: vi.fn(),
    onPluginToggle: vi.fn(),
    onMcpSelectAll: vi.fn(),
    onMcpUnselectAll: vi.fn(),
    onPluginsSelectAll: vi.fn(),
    onPluginsUnselectAll: vi.fn(),
    onLaunch: vi.fn(),
    onRemove: vi.fn(),
    onResumeSessionChange: vi.fn(),
  };

  const renderCard = (overrides?: Partial<SessionSlot>) =>
    render(<PreLaunchCard {...defaultProps} slot={makeSlot(overrides)} />);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a note when a restored pane had to fall back", () => {
    renderCard({ restoreNotes: ['Branch "feat/x" no longer exists — using "main".'] });
    expect(screen.getByText(/no longer exists/)).toBeInTheDocument();
  });

  it("shows every note", () => {
    renderCard({ restoreNotes: ["First problem.", "Second problem."] });
    expect(screen.getByText("First problem.")).toBeInTheDocument();
    expect(screen.getByText("Second problem.")).toBeInTheDocument();
  });

  it("renders no notice when there is nothing to report", () => {
    renderCard();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
