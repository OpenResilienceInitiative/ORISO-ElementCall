/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

import type { MatrixClient } from "matrix-js-sdk";
import type { WidgetApi } from "matrix-widget-api";

/**
 * Fetching Matrix media once the homeserver enforces authenticated media.
 *
 * There are two routes, and which one is available depends on whether we own a
 * Matrix login:
 *
 * **SPA mode** — we have our own access token, so we ask the homeserver for a
 * server-side scaled thumbnail over
 * `GET /_matrix/client/v1/media/thumbnail/...` with an `Authorization` header.
 * Cheap: the server does the scaling and sends a small image.
 *
 * **Widget mode** — we own no login at all. The matryoshka client built by
 * `createRoomWidgetClient` is constructed without an `accessToken` (see
 * `widget.ts`), so `client.getAccessToken()` is empty and every authenticated
 * media endpoint is closed to us. The only route is MSC4039
 * (`org.matrix.msc4039.download_file`): we hand the host an `mxc://` URI over
 * `postMessage` and it fetches the bytes with *its* credentials. MSC4039 has no
 * thumbnail variant — its request carries nothing but `content_uri` — so the
 * host can only return the original file, and we scale it down here.
 *
 * Note what this does *not* do: it never gives the widget a token, and it never
 * touches the legacy unauthenticated `/_matrix/media/v3/...` endpoints. Every
 * byte is still fetched under an authenticated request; the only question is
 * which side of the iframe boundary holds the credential.
 */

/** Largest original we are willing to decode from a widget media download. */
const MAX_WIDGET_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * Fetches the bytes behind an `mxc://` URI, scaled to roughly `sizePx` where
 * the route allows it. Resolves to `null` when the media cannot be obtained.
 */
export type MediaFetcher = (
  mxcUri: string,
  sizePx: number,
) => Promise<Blob | null>;

/**
 * Builds the authenticated thumbnail URL for an `mxc://` URI.
 *
 * `allowDirectLinks` stays `false` on purpose: it only affects srcs that are
 * *not* `mxc://`, and returning those verbatim would fetch a third-party URL
 * and leak the viewer's IP to whoever put it in the room. `useAuthentication`
 * is `true`, which is what selects the `/_matrix/client/v1/media` prefix over
 * the legacy unauthenticated one.
 */
export function getAuthenticatedThumbnailUrl(
  client: MatrixClient,
  mxcUrl: string | null,
  avatarSize = 96,
): string | null {
  if (!mxcUrl) return null;
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  // scale is more suitable for larger sizes
  const resizeMethod = avatarSize <= 96 ? "crop" : "scale";
  return (
    client.mxcUrlToHttp(
      mxcUrl,
      width,
      height,
      resizeMethod,
      false, // allowDirectLinks
      true, // allowRedirects
      true, // useAuthentication
    ) || null
  );
}

/**
 * The SPA route: our own token against the authenticated thumbnail endpoint.
 */
export function createHomeserverMediaFetcher(
  client: MatrixClient,
): MediaFetcher | null {
  const token = client.getAccessToken();
  if (!token) return null;

  return async (mxcUri, sizePx) => {
    const url = getAuthenticatedThumbnailUrl(client, mxcUri, sizePx);
    if (!url) return null;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Authenticated media request failed with ${response.status}`,
      );
    }
    return response.blob();
  };
}

/**
 * The widget route: MSC4039 `download_file` through the host, then scale the
 * original down locally because MSC4039 cannot ask for a thumbnail.
 */
export function createWidgetMediaFetcher(widgetApi: WidgetApi): MediaFetcher {
  return async (mxcUri, sizePx) => {
    if (!mxcUri.startsWith("mxc://")) return null;
    const { file } = await widgetApi.downloadFile(mxcUri);
    const blob = coerceToBlob(file);
    if (!blob) return null;
    if (blob.size > MAX_WIDGET_MEDIA_BYTES) {
      logger.warn(
        `Refusing media ${mxcUri}: ${blob.size} bytes exceeds the widget download cap`,
      );
      return null;
    }
    return downscale(blob, Math.floor(sizePx * window.devicePixelRatio));
  };
}

/**
 * MSC4039 types the response as `XMLHttpRequestBodyInit`, so a host may hand us
 * a `Blob`, an `ArrayBuffer`, a view onto one, or (in principle) a string.
 * Normalise whatever arrives into a `Blob`.
 */
function coerceToBlob(file: XMLHttpRequestBodyInit | undefined): Blob | null {
  if (!file) return null;
  if (file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file]);
  if (ArrayBuffer.isView(file)) return new Blob([file]);
  // A string or FormData is not an image; refuse rather than guess.
  return null;
}

/**
 * Scales an image blob down so that its shorter side is at most `targetPx`.
 * Returns the original blob unchanged if it is already small enough, or if the
 * browser cannot decode or re-encode it — a slightly oversized avatar is much
 * better than no avatar.
 */
async function downscale(blob: Blob, targetPx: number): Promise<Blob> {
  if (
    targetPx <= 0 ||
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas !== "function"
  ) {
    return blob;
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const scale = targetPx / Math.min(bitmap.width, bitmap.height);
    if (scale >= 1) return blob;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/png" });
  } catch (error) {
    logger.debug("Could not downscale media, using the original", error);
    return blob;
  } finally {
    bitmap?.close();
  }
}
