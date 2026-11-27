/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ProcessorWrapper,
  supportsBackgroundProcessors,
  type BackgroundOptions,
} from "@livekit/track-processors";
import {
  createContext,
  type FC,
  type JSX,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type LocalVideoTrack } from "livekit-client";
import { combineLatest, map, type Observable } from "rxjs";
import { useObservable } from "observable-hooks";

import {
  backgroundBlur as backgroundBlurSettings,
  type Setting,
  useSetting,
} from "../settings/settings";
import { getUrlParams } from "../UrlParams";
import { BlurBackgroundTransformer } from "./BlurBackgroundTransformer";
import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";

//TODO-MULTI-SFU: This is not yet fully there.
// it is a combination of exposing observable and react hooks.
// preferably we should not make this a context anymore and instead just a vm?

export type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
};

const ProcessorContext = createContext<ProcessorState | undefined>(undefined);

export function useTrackProcessor(): ProcessorState {
  const state = use(ProcessorContext);
  if (state === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
    );
  return state;
}

export function useTrackProcessorObservable$(): Observable<ProcessorState> {
  const state = use(ProcessorContext);
  if (state === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
    );
  const state$ = useObservable(
    (init$) => init$.pipe(map(([init]) => init)),
    [state],
  );

  return state$;
}

/**
 * Updates your video tracks to always use the given processor.
 */
export const trackProcessorSync = (
  scope: ObservableScope,
  videoTrack$: Behavior<LocalVideoTrack | null>,
  processor$: Behavior<ProcessorState>,
): void => {
  combineLatest([videoTrack$, processor$])
    .pipe(scope.bind())
    .subscribe(([videoTrack, processorState]) => {
      if (!processorState) return;
      if (!videoTrack) return;
      const { processor } = processorState;
      if (processor && !videoTrack.getProcessor()) {
        void videoTrack.setProcessor(processor);
      }
      if (!processor && videoTrack.getProcessor()) {
        void videoTrack.stopProcessor();
      }
    });
};

export const useTrackProcessorSync = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor } = useTrackProcessor();
  useEffect(() => {
    if (!videoTrack) return;
    if (processor && !videoTrack.getProcessor()) {
      void videoTrack.setProcessor(processor);
    }
    if (!processor && videoTrack.getProcessor()) {
      void videoTrack.stopProcessor();
    }
  }, [processor, videoTrack]);
};

/**
 * Applies the host's `backgroundBlur` URL flag (ORISO-Frontend#2558) to the
 * stored setting. `undefined` (flag absent) keeps the stored setting. Stored
 * like a choice made in Element Call's own settings, so toggling it there in
 * the call works as before.
 */
export function applyInitialBackgroundBlur(
  urlValue: boolean | undefined,
  setting: Setting<boolean> = backgroundBlurSettings,
): void {
  if (urlValue === undefined || setting.getValue() === urlValue) return;
  setting.setValue(urlValue);
}

interface Props {
  children: JSX.Element;
}

export const ProcessorProvider: FC<Props> = ({ children }) => {
  // Once per mount and before the setting is read below, so the first
  // processor state (and with it the first video track) already follows the
  // host's choice.
  useState(() => applyInitialBackgroundBlur(getUrlParams().backgroundBlur));
  // The setting the user wants to have
  const [blurActivated] = useSetting(backgroundBlurSettings);
  const supported = useMemo(() => supportsBackgroundProcessors(), []);
  const blur = useMemo(
    () =>
      new ProcessorWrapper(
        new BlurBackgroundTransformer({ blurRadius: 15 }),
        "background-blur",
      ),
    [],
  );

  // This is the actual state exposed through the context
  const processorState = useMemo(
    () => ({
      supported,
      processor: supported && blurActivated ? blur : undefined,
    }),
    [supported, blurActivated, blur],
  );

  return <ProcessorContext value={processorState}>{children}</ProcessorContext>;
};
