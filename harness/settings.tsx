/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * Visual proof for the call settings dialog (#110), opened as the ⋮ menu
 * opens it. `?oriso=0` shows Element Call's own dialog for the comparison,
 * `?tab=video` the camera tab. A touch device gets the bottom sheet.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@vector-im/compound-web";
import { of } from "rxjs";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { MatrixClient } from "matrix-js-sdk";

import { SettingsModal } from "../src/settings/SettingsModal";
import { MediaDevicesContext } from "../src/MediaDevicesContext";
import { ProcessorProvider } from "../src/livekit/TrackProcessorContext";
import type { MediaDevices } from "../src/state/MediaDevices";
import de from "../locales/de/app.json";
import en from "../locales/en/app.json";
import "../src/index.css";
import "../src/oriso-theme.css";

void i18n.use(initReactI18next).init({
  lng: new URLSearchParams(window.location.search).get("lang") ?? "de",
  fallbackLng: "en",
  defaultNS: "app",
  keySeparator: ".",
  nsSeparator: false,
  resources: { de: { app: de }, en: { app: en } },
  interpolation: { escapeValue: false },
});

const params = new URLSearchParams(window.location.search);
const oriso = params.get("oriso") !== "0";
const tab = params.get("tab") === "video" ? "video" : "audio";

const device = (names: [string, string][]): MediaDevices["audioInput"] =>
  ({
    available$: of(
      new Map(names.map(([id, name]) => [id, { type: "name", name }])),
    ),
    selected$: of({ id: names[0][0] }),
    select(): void {},
  }) as unknown as MediaDevices["audioInput"];

const devices = {
  audioInput: device([
    ["mic-headset", "Jabra Evolve2 Headset"],
    ["mic-laptop", "MacBook Pro Mikrofon"],
  ]),
  audioOutput: device([
    ["out-headset", "Jabra Evolve2 Headset"],
    ["out-laptop", "MacBook Pro Lautsprecher"],
  ]),
  videoInput: device([
    ["cam-laptop", "FaceTime HD Kamera"],
    ["cam-usb", "Logitech C920"],
  ]),
  requestDeviceNames(): void {},
} as unknown as MediaDevices;

// Outside a widget Element Call adds a profile tab, which reads the user.
// ORISO always runs as a widget and never shows it; this only lets it render.
const client = {
  getUserId: (): string => "@berater:oriso.example",
  getUser: (): null => null,
} as unknown as MatrixClient;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter
      initialEntries={[
        oriso ? "/room/#?widgetId=w&orisoDesign=true" : "/room/#?widgetId=w",
      ]}
    >
      <div className="cpd-theme-dark" style={{ height: "100vh" }}>
        <MediaDevicesContext value={devices}>
          <ProcessorProvider>
            <TooltipProvider>
              <SettingsModal
                open
                onDismiss={(): void => {}}
                tab={tab}
                onTabChange={(): void => {}}
                client={client}
              />
            </TooltipProvider>
          </ProcessorProvider>
        </MediaDevicesContext>
      </div>
    </MemoryRouter>
  </StrictMode>,
);
