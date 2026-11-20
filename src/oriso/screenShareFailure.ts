/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Why a screen share did not start, as the person needs to hear it:
 *  - `system`: the operating system withholds screen recording from the
 *    browser (macOS asks for it once, in its privacy settings);
 *  - `blocked`: the page or the embedding forbids capturing the screen;
 *  - `failed`: anything else.
 */
export type ScreenShareFailure = "system" | "blocked" | "failed";

/**
 * Sorts the error `setScreenShareEnabled` rejected with.
 *
 * A closed picker is not a failure: every browser reports it as a plain
 * `NotAllowedError`, and the person who closed it knows why. The two other
 * `NotAllowedError`s are told apart by their message, because the name is
 * the same — "by system" is Chrome's wording for the missing macOS
 * permission, and a permissions-policy refusal names the feature.
 */
export function screenShareFailure(error: unknown): ScreenShareFailure | null {
  // A DOMException is not an Error in every engine (jsdom's is not), so
  // read the two fields rather than test the class.
  const { name = "", message = "" } =
    typeof error === "object" && error !== null
      ? (error as { name?: string; message?: string })
      : {};
  if (name === "SecurityError") return "blocked";
  if (name === "NotAllowedError") {
    if (/by system/i.test(message)) return "system";
    if (/policy|disallowed|display-capture/i.test(message)) return "blocked";
    return null;
  }
  return "failed";
}
