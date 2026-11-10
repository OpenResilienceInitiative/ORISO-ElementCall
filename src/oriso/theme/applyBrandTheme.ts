/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

import { type UrlParams } from "../../UrlParams";
import { buildBrandThemeCss, resolveBrandSeeds } from "./brandTheme";

export const BRAND_STYLE_ID = "oriso-brand-theme";

/**
 * Paints the call in the Träger's colours, if the call address names any.
 *
 * Adds one `<style id="oriso-brand-theme">` at the end of `<head>`. It lives
 * in the same Compound layer as the shipped `oriso-theme.css` and comes after
 * it, so it wins there without `!important`. Without a usable primary colour
 * nothing is added and the shipped default stays untouched.
 *
 * Call it before React renders: the body stays hidden (`no-theme`) until the
 * theme hook runs, so the default palette is never seen first.
 *
 * @returns whether a brand palette was injected
 */
export const applyBrandTheme = (
  params: Pick<UrlParams, "orisoPrimary" | "orisoAccent" | "orisoSignal">,
  doc: Document = document,
): boolean => {
  doc.getElementById(BRAND_STYLE_ID)?.remove();

  const seeds = resolveBrandSeeds({
    primary: params.orisoPrimary,
    accent: params.orisoAccent,
    signal: params.orisoSignal,
  });
  if (seeds === null) {
    return false;
  }

  let css: string;
  try {
    css = buildBrandThemeCss(seeds);
  } catch (error) {
    // Branding is decoration: whatever goes wrong here, the call still opens
    // in the shipped palette.
    logger.warn("Call branding: could not build the palette.", error);
    return false;
  }

  const style = doc.createElement("style");
  style.id = BRAND_STYLE_ID;
  style.textContent = css;
  doc.head.appendChild(style);
  return true;
};
