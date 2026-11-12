/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * "Teilnehmende" as a panel: who is in the call, and inviting somebody else
 * from the same place (Frank, 12 Nov, ORISO-Frontend#2233).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { OrisoToolbar } from "./OrisoToolbar";
import { OrisoParticipantsPanel } from "./OrisoParticipantsPanel";
import { OrisoStageContext } from "./useOrisoIdentities";

const people = [
  { userId: "@cyrus:oriso.org", displayName: "Susanne P." },
  { userId: "@hugo:oriso.org", displayName: "@hugo:oriso.org" },
];

const identities = new Map([
  [
    "@hugo:oriso.org",
    {
      kind: "animal" as const,
      file: "fox.svg",
      bg: "#62937A",
      ink: "#FBF4D3",
      name: "ruhiger Fuchs 432",
      role: "asker" as const,
    },
  ],
]);

const inStage = (ui: React.ReactNode): ReturnType<typeof render> =>
  render(
    <OrisoStageContext
      value={{
        identities,
        counsellors: new Set(["@cyrus:oriso.org"]),
        parentUrl: null,
        enabled: true,
      }}
    >
      {ui}
    </OrisoStageContext>,
  );

const link = async (): Promise<{ url: string }> =>
  Promise.resolve({ url: "https://app.oriso.org/call/abc" });

describe("the participants panel", () => {
  it("lists everybody by the name the stage shows, never a login name", () => {
    inStage(
      <OrisoParticipantsPanel
        participants={people}
        inviteRequest={null}
        onClose={vi.fn()}
      />,
    );
    const rows = screen.getAllByTestId("oriso-participant");
    expect(rows).toHaveLength(2);
    // The host's list makes the counsellor; the record names the asker.
    expect(rows[0]).toHaveTextContent("Susanne P.");
    expect(rows[0]).toHaveTextContent("Counselling");
    expect(rows[1]).toHaveTextContent("ruhiger Fuchs 432");
    expect(rows[1]).toHaveTextContent("anonymous · seeking advice");
    expect(screen.queryByText("@hugo:oriso.org")).toBeNull();
    // No host to ask: nobody to invite.
    expect(screen.queryByTestId("oriso-participants-invite")).toBeNull();
  });

  it("invites somebody: asks the host for the link and shows it", async () => {
    const request = vi.fn(link);
    inStage(
      <OrisoParticipantsPanel
        participants={people}
        inviteRequest={request}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("oriso-participants-invite"));
    expect(request).toHaveBeenCalledOnce();
    expect(
      ((await screen.findByTestId("oriso-invite-url")) as HTMLInputElement)
        .value,
    ).toBe("https://app.oriso.org/call/abc");
  });

  it("asks for the link at once when opened to send it", async () => {
    const request = vi.fn(link);
    inStage(
      <OrisoParticipantsPanel
        participants={people}
        inviteRequest={request}
        inviting
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByTestId("oriso-invite-url")).toBeTruthy();
    expect(request).toHaveBeenCalledOnce();
  });

  it("closes on Escape and with its close button", () => {
    const onClose = vi.fn();
    inStage(
      <OrisoParticipantsPanel
        participants={people}
        inviteRequest={null}
        onClose={onClose}
      />,
    );
    const panel = screen.getByTestId("oriso-participants-panel");
    fireEvent.keyDown(panel, { key: "Escape" });
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("has no accessibility violations", async () => {
    const { container } = inStage(
      <OrisoParticipantsPanel
        participants={people}
        inviteRequest={link}
        onClose={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("the call menu's people entries", () => {
  const bar = (
    inviteRequest: (() => Promise<{ url: string }>) | null,
  ): ReturnType<typeof render> =>
    inStage(
      <OrisoToolbar
        audioMuted={false}
        onToggleAudio={vi.fn()}
        videoMuted
        onToggleVideo={vi.fn()}
        handRaised={false}
        onToggleHand={vi.fn()}
        onToggleNotes={vi.fn()}
        onHangup={vi.fn()}
        participantCount={2}
        participants={people}
        inviteRequest={inviteRequest}
        onToggleScreenShare={vi.fn()}
        sharingScreen={false}
        onOpenSoundSettings={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
  const entry = (name: string): HTMLElement =>
    screen
      .getByTestId("oriso-call-menu")
      .querySelector<HTMLElement>(`[data-entry="${name}"]`)!;

  it("opens the list from Teilnehmende, in the menu's place", () => {
    bar(link);
    fireEvent.click(screen.getByTestId("incall_menu"));
    fireEvent.click(entry("participants"));
    expect(screen.queryByTestId("oriso-call-menu")).toBeNull();
    expect(screen.getAllByTestId("oriso-participant")).toHaveLength(2);
  });

  it("sends the invite link from its own entry, under Teilnehmende", async () => {
    bar(link);
    fireEvent.click(screen.getByTestId("incall_menu"));
    const entries = [
      ...screen
        .getByTestId("oriso-call-menu")
        .querySelectorAll<HTMLElement>("[data-entry]"),
    ].map((el) => el.dataset.entry);
    expect(entries.slice(0, 2)).toEqual(["participants", "invite"]);
    fireEvent.click(entry("invite"));
    expect(await screen.findByTestId("oriso-invite-url")).toBeTruthy();
  });

  it("offers no invite entry without a host to ask", () => {
    bar(null);
    fireEvent.click(screen.getByTestId("incall_menu"));
    expect(
      screen
        .getByTestId("oriso-call-menu")
        .querySelector('[data-entry="invite"]'),
    ).toBeNull();
  });
});
