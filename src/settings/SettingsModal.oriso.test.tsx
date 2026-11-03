/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@vector-im/compound-web";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { of } from "rxjs";

import type { MatrixClient } from "matrix-js-sdk";
import { SettingsModal } from "./SettingsModal";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { deviceStub, mockMediaDevices } from "../utils/test";
import styles from "./SettingsModal.module.css";

// The video tab's blur switch asks the track processor, which a call provides.
vi.mock("../livekit/TrackProcessorContext", () => ({
  useTrackProcessor: (): { supported: boolean } => ({ supported: true }),
}));
// Outside a widget the profile tab joins in; it needs a real client.
vi.mock("./ProfileSettingsTab", () => ({
  ProfileSettingsTab: (): null => null,
}));

// The tab bar measures itself; jsdom has no ResizeObserver, and nothing here
// depends on the measured size.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  } as unknown as typeof ResizeObserver;
});

const microphones = {
  ...deviceStub,
  available$: of(
    new Map([
      ["mic-a", { type: "name", name: "Headset" }],
      ["mic-b", { type: "name", name: "Laptop" }],
    ]),
  ),
  selected$: of({ id: "mic-a" }),
};

const renderSettings = (orisoDesign: boolean): HTMLElement => {
  render(
    <MemoryRouter
      initialEntries={[
        orisoDesign ? "/room/#?orisoDesign=true" : "/room/#?widgetId=w",
      ]}
    >
      <MediaDevicesContext
        value={mockMediaDevices({
          audioInput: microphones as never,
          requestDeviceNames: vi.fn(),
        })}
      >
        <TooltipProvider>
          <SettingsModal
            open
            onDismiss={vi.fn()}
            tab="audio"
            onTabChange={vi.fn()}
            client={{} as MatrixClient}
          />
        </TooltipProvider>
      </MediaDevicesContext>
    </MemoryRouter>,
  );
  return screen.getByRole("dialog");
};

describe("the settings dialog in the ORISO design (#110)", () => {
  it("takes the ORISO look when the host asks for the ORISO design", () => {
    const dialog = renderSettings(true);
    // Light tokens under the dark call, and the hooks the ORISO rules hang on.
    expect(dialog.classList).toContain("cpd-theme-light");
    expect(dialog.classList).toContain("oriso-settings");
    expect(dialog.classList).toContain(styles.oriso);
  });

  it("stays Element Call's dialog without the ORISO design", () => {
    const dialog = renderSettings(false);
    expect(dialog.classList).not.toContain("cpd-theme-light");
    expect(dialog.classList).not.toContain("oriso-settings");
  });

  it("still offers every microphone to pick", () => {
    renderSettings(true);
    expect(screen.getByRole("radio", { name: "Headset" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Laptop" })).not.toBeChecked();
  });
});
