import { beforeEach, describe, it, expect } from "vitest";

import { useSessionStore } from "../useSessionStore";

beforeEach(() => {
  useSessionStore.setState({ claudeUuidBySession: {} });
});

describe("setClaudeUuid", () => {
  it("records a conversation uuid against a maestro session", () => {
    useSessionStore.getState().setClaudeUuid(7, "abc-123");
    expect(useSessionStore.getState().claudeUuidBySession[7]).toBe("abc-123");
  });

  it("overwrites when a session reports a new conversation", () => {
    useSessionStore.getState().setClaudeUuid(7, "abc-123");
    useSessionStore.getState().setClaudeUuid(7, "def-456");
    expect(useSessionStore.getState().claudeUuidBySession[7]).toBe("def-456");
  });

  it("keeps sessions independent", () => {
    useSessionStore.getState().setClaudeUuid(1, "aaa");
    useSessionStore.getState().setClaudeUuid(2, "bbb");
    expect(useSessionStore.getState().claudeUuidBySession).toEqual({ 1: "aaa", 2: "bbb" });
  });

  it("does not churn state when the uuid is unchanged", () => {
    useSessionStore.getState().setClaudeUuid(7, "abc-123");
    const before = useSessionStore.getState().claudeUuidBySession;
    useSessionStore.getState().setClaudeUuid(7, "abc-123");
    expect(useSessionStore.getState().claudeUuidBySession).toBe(before);
  });
});
