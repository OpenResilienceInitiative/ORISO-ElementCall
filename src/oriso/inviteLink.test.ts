/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";

import { inviteLinkRequester, readInviteReply } from "./inviteLink";

const host = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("../widget", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    widget: { api: { transport: { send: host.send } } },
  };
});

describe("the host's answer to invite_link (S8)", () => {
  it("takes a link", () => {
    expect(readInviteReply({ url: "https://oriso.test/call/abc" })).toEqual({
      url: "https://oriso.test/call/abc",
    });
  });

  it("takes the error the host sends as a plain field", () => {
    expect(
      readInviteReply({ error: "This call has no link to share" }),
    ).toEqual({ error: "This call has no link to share" });
  });

  it("reads a widget-style error too, rather than dropping it", () => {
    expect(readInviteReply({ error: { message: "nope" } })).toEqual({
      error: "nope",
    });
  });

  it.each([
    ["nothing", undefined],
    ["an empty reply", {}],
    ["an empty url", { url: " " }],
    ["a script url", { url: "javascript:alert(1)" }],
    ["not a url", { url: "call/abc" }],
  ])("treats %s as an error, never as a link", (_case, reply) => {
    expect(readInviteReply(reply)).toHaveProperty("error");
  });
});

describe("asking the host for the link", () => {
  beforeEach(() => {
    // Braces: a function returned from beforeEach is run as a teardown.
    host.send.mockReset();
  });

  it("sends org.oriso.call.invite_link with no data", async () => {
    host.send.mockResolvedValue({ url: "https://oriso.test/l/1" });
    const reply = await inviteLinkRequester()!();
    expect(host.send).toHaveBeenCalledWith("org.oriso.call.invite_link", {});
    expect(reply).toEqual({ url: "https://oriso.test/l/1" });
  });

  it("passes the host's error through as an answer", async () => {
    host.send.mockResolvedValue({ error: "The link could not be created" });
    expect(await inviteLinkRequester()!()).toEqual({
      error: "The link could not be created",
    });
  });

  it("turns a failed request into an error answer", async () => {
    host.send.mockRejectedValue(new Error("timeout"));
    expect(await inviteLinkRequester()!()).toEqual({ error: "timeout" });
  });
});
