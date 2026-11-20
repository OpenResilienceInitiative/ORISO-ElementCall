/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { screenShareFailure } from "./screenShareFailure";

const domError = (name: string, message: string): DOMException =>
  new DOMException(message, name);

/*
 * #2233 (R8): starting a share used to fail without a word — the error went
 * to the log and the button simply stayed off. The person who closed the
 * picker on purpose must not be told off; everybody else must learn why.
 */
describe("why a screen share did not start", () => {
  it("stays silent when the person closed the picker", () => {
    // Chrome, Firefox and Safari all report a cancelled picker this way.
    expect(
      screenShareFailure(domError("NotAllowedError", "Permission denied")),
    ).toBeNull();
    expect(
      screenShareFailure(
        domError("NotAllowedError", "Permission denied by user"),
      ),
    ).toBeNull();
  });

  it("names the operating system when it withholds screen recording", () => {
    // macOS without the Screen Recording permission for the browser.
    expect(
      screenShareFailure(
        domError("NotAllowedError", "Permission denied by system"),
      ),
    ).toBe("system");
  });

  it("names the page when the embedding forbids it", () => {
    expect(
      screenShareFailure(
        domError(
          "NotAllowedError",
          'Access to the feature "display-capture" is disallowed by permissions policy.',
        ),
      ),
    ).toBe("blocked");
    expect(screenShareFailure(domError("SecurityError", "Insecure"))).toBe(
      "blocked",
    );
  });

  it("says that it failed for anything else", () => {
    expect(screenShareFailure(domError("NotReadableError", "Busy"))).toBe(
      "failed",
    );
    expect(screenShareFailure(domError("AbortError", ""))).toBe("failed");
    expect(screenShareFailure(new Error("publish timed out"))).toBe("failed");
    expect(screenShareFailure("nonsense")).toBe("failed");
  });
});
