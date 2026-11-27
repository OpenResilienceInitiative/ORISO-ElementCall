/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { Page } from "@playwright/test";

type ProbeWindow = Window & { testPeerConnections?: RTCPeerConnection[] };
type MediaObservation = {
  received: { audio: boolean; video: boolean };
  played: { audio: boolean; video: boolean };
};
type TrackSample = {
  id: string;
  kind: "audio" | "video";
  bytes: number;
  elapsed: number;
  frames: number;
};

export function installReceiverObserver(origin: string): void {
  if (location.origin !== origin) return;
  const peers: RTCPeerConnection[] = [];
  (window as ProbeWindow).testPeerConnections = peers;
  const PeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends PeerConnection {
    public constructor(configuration?: RTCConfiguration) {
      super(configuration);
      peers.push(this);
    }
  };
}

async function sample(page: Page): Promise<TrackSample[]> {
  return page.evaluate(async () => {
    const peers = (window as ProbeWindow).testPeerConnections ?? [];
    const elements = Array.from(
      document.querySelectorAll<HTMLMediaElement>("audio,video"),
    );
    const snapshots: TrackSample[] = [];
    for (const peer of peers) {
      if (peer.connectionState === "closed") continue;
      for (const receiver of peer.getReceivers()) {
        const track = receiver.track;
        const kind = track.kind;
        if (
          track.readyState !== "live" ||
          (kind !== "audio" && kind !== "video")
        )
          continue;

        const stats = await receiver.getStats();
        let bytes = 0;
        for (const entry of stats.values()) {
          if (
            entry.type === "inbound-rtp" &&
            typeof entry.bytesReceived === "number"
          ) {
            bytes += entry.bytesReceived;
          }
        }
        const element = elements.find((media) => {
          if (
            media.localName !== kind ||
            media.paused ||
            media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !(media.srcObject instanceof MediaStream) ||
            !media.srcObject.getTracks().includes(track)
          ) {
            return false;
          }
          if (kind === "audio") return !media.muted && media.volume > 0;
          const { width, height } = media.getBoundingClientRect();
          return (
            width > 0 &&
            height > 0 &&
            media.checkVisibility({
              opacityProperty: true,
              visibilityProperty: true,
            })
          );
        });
        const quality =
          element instanceof HTMLVideoElement
            ? element.getVideoPlaybackQuality()
            : undefined;
        snapshots.push({
          id: track.id,
          kind,
          bytes,
          elapsed: element?.currentTime ?? 0,
          frames: quality
            ? quality.totalVideoFrames - quality.droppedVideoFrames
            : 0,
        });
      }
    }
    return snapshots;
  });
}

export async function observeMedia(page: Page): Promise<MediaObservation> {
  const before = new Map(
    (await sample(page)).map((track) => [track.id, track]),
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  const received = { audio: false, video: false };
  const played = { audio: false, video: false };
  for (const track of await sample(page)) {
    const previous = before.get(track.id);
    if (!previous || track.bytes <= previous.bytes) continue;
    received[track.kind] = true;
    if (
      track.elapsed - previous.elapsed > 0.05 &&
      (track.kind === "audio" || track.frames > previous.frames)
    ) {
      played[track.kind] = true;
    }
  }
  return { received, played };
}
