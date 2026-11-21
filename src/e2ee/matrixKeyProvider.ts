/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";

import { type Behavior } from "../state/Behavior";
import { LocalMediaEncryptionError } from "../utils/errors";

export type LocalMediaEncryptionState =
  | "pending"
  | "ready"
  | LocalMediaEncryptionError;

export interface LocalMediaKey {
  localKeyState$: Behavior<LocalMediaEncryptionState>;
  retryLocalKey: (retryPending?: boolean) => void;
}

type MatrixMediaKey = {
  bytes: Uint8Array;
  index: number;
};

export class MatrixKeyProvider
  extends BaseKeyProvider
  implements LocalMediaKey
{
  private rtcSession?: MatrixRTCSession;
  private pendingLocalKey?: MatrixMediaKey;
  private localImportRevision = 0;
  private readonly localKeyStateSubject$ =
    new BehaviorSubject<LocalMediaEncryptionState>("pending");
  public readonly localKeyState$: Behavior<LocalMediaEncryptionState> =
    this.localKeyStateSubject$;

  public constructor(private readonly localParticipantId: string) {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
  }

  public setRTCSession(rtcSession?: MatrixRTCSession): void {
    if (this.rtcSession === rtcSession) return;
    this.rtcSession?.off(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.onEncryptionKeyChanged,
    );
    ++this.localImportRevision;
    this.pendingLocalKey = undefined;
    this.rtcSession = rtcSession;
    this.localKeyStateSubject$.next("pending");

    rtcSession?.on(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.onEncryptionKeyChanged,
    );
    rtcSession?.reemitEncryptionKeys();
  }

  public retryLocalKey = (retryPending = false): void => {
    const state = this.localKeyStateSubject$.value;
    if (state === "ready" || (state === "pending" && !retryPending)) return;
    if (this.pendingLocalKey) this.importLocalKey(this.pendingLocalKey);
    else this.rtcSession?.reemitEncryptionKeys();
  };

  private importLocalKey(key: MatrixMediaKey): void {
    const revision = ++this.localImportRevision;
    this.pendingLocalKey = key;
    this.localKeyStateSubject$.next("pending");
    void this.importKey(key, this.localParticipantId, revision);
  }

  private onEncryptionKeyChanged = (
    bytes: Uint8Array,
    index: number,
    participantId: string,
  ): void => {
    const key: MatrixMediaKey = { bytes, index };
    if (participantId === this.localParticipantId) {
      this.importLocalKey(key);
    } else {
      void this.importKey(key, participantId);
    }
  };

  private async importKey(
    { bytes, index }: MatrixMediaKey,
    participantId: string,
    localRevision?: number,
  ): Promise<void> {
    const session = this.rtcSession;
    const isCurrent = (): boolean =>
      this.rtcSession === session &&
      (localRevision === undefined ||
        localRevision === this.localImportRevision);
    try {
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        // WebCrypto expects bytes in a plain ArrayBuffer.
        bytes as Uint8Array<ArrayBuffer>,
        "HKDF",
        false,
        ["deriveBits", "deriveKey"],
      );
      // A late import must never replace the current sender key in LiveKit.
      if (!isCurrent()) return;
      this.onSetEncryptionKey(keyMaterial, participantId, index);
      if (localRevision !== undefined) {
        this.pendingLocalKey = undefined;
        this.localKeyStateSubject$.next("ready");
      }
    } catch (error) {
      if (!isCurrent()) return;
      logger.error(
        `Failed to create key material for livekit room=${session?.room.roomId} participantId=${participantId} encryptionKeyIndex=${index}`,
        error,
      );
      if (localRevision !== undefined) {
        this.localKeyStateSubject$.next(new LocalMediaEncryptionError(error));
      }
    }
  }
}
