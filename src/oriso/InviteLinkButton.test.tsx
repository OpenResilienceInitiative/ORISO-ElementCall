/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InviteLinkButton } from "./InviteLinkButton";
import { type InviteLinkReply } from "./inviteLink";

const URL_ = "https://oriso.test/call/abc";

describe("Link teilen (S8)", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  const renderButton = (
    reply: InviteLinkReply,
  ): { request: ReturnType<typeof vi.fn> } => {
    const request = vi.fn().mockResolvedValue(reply);
    render(<InviteLinkButton request={request} tone="light" />);
    return { request };
  };

  it("copies the link and shows it with the knocking hint", async () => {
    const user = userEvent.setup();
    const { request } = renderButton({ url: URL_ });
    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(request).toHaveBeenCalledOnce();
    expect(await screen.findByTestId("oriso-invite-url")).toHaveValue(URL_);
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(screen.getByTestId("oriso-invite-copy")).toHaveTextContent("Copied");
    expect(
      screen.getByText("Whoever opens the link knocks and is let in by you."),
    ).toBeInTheDocument();
  });

  it("copies again from the popover's button", async () => {
    const user = userEvent.setup();
    renderButton({ url: URL_ });
    await user.click(screen.getByRole("button", { name: "Share link" }));
    await user.click(await screen.findByTestId("oriso-invite-copy"));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("still shows the link when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const user = userEvent.setup();
    renderButton({ url: URL_ });
    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(await screen.findByTestId("oriso-invite-url")).toHaveValue(URL_);
    expect(screen.getByTestId("oriso-invite-copy")).toHaveTextContent("Copy");
    expect(screen.getByText(/Could not copy automatically/)).toBeTruthy();
  });

  it("shows the host's error and copies nothing", async () => {
    const user = userEvent.setup();
    renderButton({ error: "This call has no link to share" });
    await user.click(screen.getByRole("button", { name: "Share link" }));
    const error = await screen.findByTestId("oriso-invite-error");
    expect(error).toHaveTextContent("The link could not be created.");
    expect(error).toHaveTextContent("This call has no link to share");
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByTestId("oriso-invite-url")).toBeNull();
  });

  it("closes on Escape and on a second click", async () => {
    const user = userEvent.setup();
    renderButton({ url: URL_ });
    const trigger = screen.getByRole("button", { name: "Share link" });
    await user.click(trigger);
    await screen.findByTestId("oriso-invite-url");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("oriso-invite-popover")).toBeNull();
    await user.click(trigger);
    await screen.findByTestId("oriso-invite-url");
    await user.click(trigger);
    expect(screen.queryByTestId("oriso-invite-popover")).toBeNull();
  });
});
