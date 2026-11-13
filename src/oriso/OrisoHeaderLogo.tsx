/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useMemo, useState } from "react";

import { Config } from "../config/Config";
import {
  allowedBrandLogo,
  brandLogoOrigins,
  parseOperatorLogo,
} from "./brandLogo";
import styles from "./OrisoHeaderLogo.module.css";

interface Props {
  /** The logo address from the call address (see `parseBrandLogo`), or null. */
  src: string | null;
}

/**
 * Where a logo may come from: the page's own origin and what the config lists.
 * The config is read when the logo is drawn, not when the address is parsed:
 * the address is parsed (and cached) before the config has been fetched.
 */
const trustedOrigins = (): string[] => {
  let configured: unknown;
  try {
    configured = Config.get().oriso?.brand_logo_origins;
  } catch {
    // Config not initialised: the page's own origin only.
  }
  return brandLogoOrigins(window.location.origin, configured);
};

/** The platform operator's logo from the config, or null (see brandLogo.ts). */
const operatorLogo = (): string | null => {
  let configured: unknown;
  try {
    configured = Config.get().oriso?.operator_logo;
  } catch {
    // Config not initialised: no operator logo yet.
  }
  return parseOperatorLogo(configured, window.location.origin);
};

/**
 * The Träger's logo, left of the title in the ORISO call header — or the
 * platform operator's where the Träger has none (#2233 R29).
 *
 * Fail-closed: the address comes from a link anybody can craft, so it is drawn
 * only if it is the tenant logo route on a trusted origin (see brandLogo.ts).
 * Otherwise it is treated as no logo.
 *
 * No logo, no image, no gap: without an address nothing is rendered, and an
 * image that fails to load is dropped for good instead of leaving a broken
 * icon. Until it has loaded it is `hidden`, so its slot does not take a gap
 * in the header's flex row.
 *
 * Decorative (`alt=""`): the title beside it already says where the call is.
 * `no-referrer` keeps the call's origin from the logo's host.
 */
const OrisoHeaderLogoImage: FC<{ src: string; onFail?: () => void }> = ({
  src,
  onFail,
}) => {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  if (state === "failed") {
    return null;
  }
  return (
    <img
      className={styles.logo}
      data-testid="oriso_header_logo"
      src={src}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      hidden={state === "loading"}
      onLoad={() => setState("loaded")}
      onError={() => {
        setState("failed");
        onFail?.();
      }}
    />
  );
};

export const OrisoHeaderLogo: FC<Props> = ({ src }) => {
  const trusted = useMemo(() => allowedBrandLogo(src, trustedOrigins()), [src]);
  const operator = useMemo(() => operatorLogo(), []);
  // The Träger's logo that failed to load, so the operator's takes its place.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = trusted !== null && trusted !== failed ? trusted : operator;
  // Keyed by address: a new logo gets a fresh chance after a failed one.
  return shown === null ? null : (
    <OrisoHeaderLogoImage
      key={shown}
      src={shown}
      onFail={shown === trusted ? (): void => setFailed(trusted) : undefined}
    />
  );
};
