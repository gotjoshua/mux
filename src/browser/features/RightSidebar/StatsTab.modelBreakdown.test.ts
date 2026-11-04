import { describe, expect, it } from "bun:test";

import type {
  ActiveStreamStats,
  ChildWorkspaceStats,
  SessionTimingStats,
} from "@/common/orpc/schemas/workspaceStats";
import { buildModelEntries } from "./StatsTab";

const emptySession = (): SessionTimingStats => ({
  totalDurationMs: 0,
  totalToolExecutionMs: 0,
  totalStreamingMs: 0,
  totalTtftMs: 0,
  ttftCount: 0,
  responseCount: 0,
  totalOutputTokens: 0,
  totalReasoningTokens: 0,
  byModel: {},
});

const activeStream = (overrides: Partial<ActiveStreamStats> = {}): ActiveStreamStats => ({
  messageId: "m1",
  model: "anthropic:claude-opus-4-5",
  mode: "exec",
  elapsedMs: 5_000,
  ttftMs: 1_000,
  toolExecutionMs: 1_000,
  modelTimeMs: 4_000,
  streamingMs: 3_000,
  outputTokens: 100,
  reasoningTokens: 20,
  liveTokenCount: 120,
  liveTPS: 40,
  invalid: false,
  anomalies: [],
  ...overrides,
});

describe("buildModelEntries", () => {
  it("renders the live stream as a row before any request has completed", () => {
    const entries = buildModelEntries({
      session: emptySession(),
      active: activeStream(),
    });

    expect(entries).toEqual([
      {
        key: "anthropic:claude-opus-4-5:exec",
        model: "anthropic:claude-opus-4-5",
        mode: "exec",
        agentId: undefined,
        totalDurationMs: 5_000,
        totalToolExecutionMs: 1_000,
        totalStreamingMs: 3_000,
        totalTtftMs: 1_000,
        ttftCount: 1,
        responseCount: 1,
        totalOutputTokens: 100,
        totalReasoningTokens: 20,
      },
    ]);
  });

  it("adds the live stream into the persisted row it will merge into on completion", () => {
    const session = emptySession();
    session.byModel["anthropic:claude-opus-4-5:exec"] = {
      model: "anthropic:claude-opus-4-5",
      mode: "exec",
      totalDurationMs: 10_000,
      totalToolExecutionMs: 2_000,
      totalStreamingMs: 6_000,
      totalTtftMs: 1_500,
      ttftCount: 1,
      responseCount: 1,
      totalOutputTokens: 200,
      totalReasoningTokens: 40,
    };

    const entries = buildModelEntries({ session, active: activeStream() });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "anthropic:claude-opus-4-5:exec",
      responseCount: 2,
      totalDurationMs: 15_000,
      totalOutputTokens: 300,
      totalReasoningTokens: 60,
      totalTtftMs: 2_500,
      ttftCount: 2,
    });
  });

  it("keys agent-split rows by agent id so live and persisted rows match", () => {
    const session = emptySession();
    session.byModel["anthropic:claude-opus-4-5:reviewer"] = {
      model: "anthropic:claude-opus-4-5",
      mode: "exec",
      agentId: "reviewer",
      totalDurationMs: 1_000,
      totalToolExecutionMs: 0,
      totalStreamingMs: 1_000,
      totalTtftMs: 0,
      ttftCount: 0,
      responseCount: 1,
      totalOutputTokens: 5,
      totalReasoningTokens: 0,
    };

    const entries = buildModelEntries({
      session,
      active: activeStream({ agentId: "reviewer" }),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("anthropic:claude-opus-4-5:reviewer");
    expect(entries[0].responseCount).toBe(2);
  });

  it("folds sub-agent workspaces (completed and live) into the breakdown", () => {
    const childSession = emptySession();
    childSession.responseCount = 1;
    childSession.byModel["anthropic:claude-haiku-4-5:exec"] = {
      model: "anthropic:claude-haiku-4-5",
      mode: "exec",
      totalDurationMs: 2_000,
      totalToolExecutionMs: 0,
      totalStreamingMs: 2_000,
      totalTtftMs: 500,
      ttftCount: 1,
      responseCount: 1,
      totalOutputTokens: 50,
      totalReasoningTokens: 0,
    };

    const children: ChildWorkspaceStats[] = [
      { workspaceId: "child-completed", title: "Sub A", session: childSession },
      {
        workspaceId: "child-running",
        title: "Sub B",
        active: activeStream({ model: "anthropic:claude-sonnet-4-5" }),
      },
    ];

    const entries = buildModelEntries({ session: emptySession(), children });

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.model === "anthropic:claude-haiku-4-5")).toMatchObject({
      key: "anthropic:claude-haiku-4-5:exec",
      responseCount: 1,
      totalOutputTokens: 50,
    });
    expect(entries.find((e) => e.model === "anthropic:claude-sonnet-4-5")).toMatchObject({
      key: "anthropic:claude-sonnet-4-5:exec",
      responseCount: 1,
      totalOutputTokens: 100,
    });
  });

  it("returns no rows when nothing has run", () => {
    expect(buildModelEntries({ session: emptySession() })).toEqual([]);
  });
});
