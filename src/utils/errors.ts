/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { t } from "i18next";

export enum ErrorCode {
  /**
   * Configuration problem due to no MatrixRTC backend/SFU is exposed via .well-known and no fallback configured.
   */
  MISSING_MATRIX_RTC_TRANSPORT = "MISSING_MATRIX_RTC_TRANSPORT",
  CONNECTION_LOST_ERROR = "CONNECTION_LOST_ERROR",
  INTERNAL_MEMBERSHIP_MANAGER = "INTERNAL_MEMBERSHIP_MANAGER",
  FAILED_TO_START_LIVEKIT = "FAILED_TO_START_LIVEKIT",
  /** LiveKit indicates that the server has hit its track limits */
  INSUFFICIENT_CAPACITY_ERROR = "INSUFFICIENT_CAPACITY_ERROR",
  E2EE_NOT_SUPPORTED = "E2EE_NOT_SUPPORTED",
  /**
   * The browser could support encryption, but this client has no working crypto
   * stack — so an encrypted room's media keys cannot be exchanged.
   */
  E2EE_UNAVAILABLE = "E2EE_UNAVAILABLE",
  MEDIA_PERMISSION_DENIED = "MEDIA_PERMISSION_DENIED",
  OPEN_ID_ERROR = "OPEN_ID_ERROR",
  SFU_ERROR = "SFU_ERROR",
  /**
   * LiveKit refused the JWT presented by the widget (401/403 from the SFU or
   * the JWT auth gateway). In ORISO this most often means the caller is not a
   * current member of the Matrix room the gateway authorises against — e.g.
   * a session whose consultant was assigned before ORISO-UserService#966
   * reordered `AgencyPreAssignmentRoomService` to add counsellors to the
   * room BEFORE the asker. Surfaced as its own code so operators do not
   * chase a generic UNKNOWN_ERROR when the real problem is room membership.
   */
  LIVEKIT_AUTH_DENIED_ERROR = "LIVEKIT_AUTH_DENIED_ERROR",
  /**
   * The JWT auth gateway itself is not responding (5xx from
   * `/livekit/jwt/sfu/get`) — the pod is down, its Matrix/OpenID dependency
   * is unreachable, or the ingress is broken. Not a code bug in the widget;
   * an operations issue. Surfaced as its own code so operators see
   * "call service unavailable" instead of a generic UNKNOWN_ERROR that could
   * be mistaken for a client bug.
   */
  LIVEKIT_JWT_SERVICE_UNAVAILABLE = "LIVEKIT_JWT_SERVICE_UNAVAILABLE",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export enum ErrorCategory {
  /** Calling is not supported, server misconfigured (JWT service missing, no MSC support ...)*/
  CONFIGURATION_ISSUE = "CONFIGURATION_ISSUE",
  NETWORK_CONNECTIVITY = "NETWORK_CONNECTIVITY",
  CLIENT_CONFIGURATION = "CLIENT_CONFIGURATION",
  UNKNOWN = "UNKNOWN",
  SYSTEM_FAILURE = "SYSTEM_FAILURE",
  // SYSTEM_FAILURE / FEDERATION_FAILURE ..
}

/**
 * Structure for errors that occur when using ElementCall.
 */
export class ElementCallError extends Error {
  public code: ErrorCode;
  public category: ErrorCategory;
  public localisedMessage?: string;
  public localisedTitle: string;

  protected constructor(
    localisedTitle: string,
    code: ErrorCode,
    category: ErrorCategory,
    localisedMessage?: string,
    cause?: Error,
  ) {
    super(localisedTitle, { cause });
    this.localisedTitle = localisedTitle;
    this.localisedMessage = localisedMessage;
    this.category = category;
    this.code = code;
  }
}

export class MatrixRTCTransportMissingError extends ElementCallError {
  public domain: string;

  public constructor(domain: string) {
    super(
      t("error.call_is_not_supported"),
      ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.matrix_rtc_transport_missing", {
        domain,
        brand: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
        errorCode: ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
      }),
    );
    this.domain = domain;
  }
}

export class ConnectionLostError extends ElementCallError {
  public constructor() {
    super(
      t("error.connection_lost"),
      ErrorCode.CONNECTION_LOST_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
      t("error.connection_lost_description"),
    );
  }
}

export class MembershipManagerError extends ElementCallError {
  public constructor(error: Error) {
    super(
      t("error.membership_manager"),
      ErrorCode.INTERNAL_MEMBERSHIP_MANAGER,
      ErrorCategory.SYSTEM_FAILURE,
      t("error.membership_manager_description"),
      error,
    );
  }
}

export class E2EENotSupportedError extends ElementCallError {
  public constructor() {
    super(
      t("error.e2ee_unsupported"),
      ErrorCode.E2EE_NOT_SUPPORTED,
      ErrorCategory.CLIENT_CONFIGURATION,
      t("error.e2ee_unsupported_description"),
    );
  }
}

/**
 * Raised when a call in an encrypted room cannot be encrypted, because the
 * crypto stack failed to initialise.
 *
 * This deliberately fails the call instead of quietly downgrading to plaintext
 * media: in a counselling context an unencrypted call that looks like an
 * encrypted one is worse than no call at all.
 */
export class E2EEUnavailableError extends ElementCallError {
  public constructor() {
    super(
      t("error.e2ee_unavailable"),
      ErrorCode.E2EE_UNAVAILABLE,
      ErrorCategory.CLIENT_CONFIGURATION,
      t("error.e2ee_unavailable_description"),
    );
  }
}

export class MediaPermissionDeniedError extends ElementCallError {
  public constructor(cause?: Error) {
    super(
      t("error.media_permission_denied"),
      ErrorCode.MEDIA_PERMISSION_DENIED,
      ErrorCategory.CLIENT_CONFIGURATION,
      t("error.media_permission_denied_description"),
      cause,
    );
  }
}

type MediaPermissionName = "microphone" | "camera";
type PermissionQuery = (name: MediaPermissionName) => Promise<PermissionState>;

const queryBrowserPermission: PermissionQuery = async (name) =>
  (
    await navigator.permissions.query({
      name,
    } as PermissionDescriptor)
  ).state;

/**
 * Chromium can surface a denied getUserMedia request from an embedded call as
 * NotSupportedError instead of NotAllowedError. Only reinterpret that broad
 * error when the Permissions API independently confirms a denied media
 * permission, so genuine unsupported-media failures remain generic.
 */
export const isBrowserMediaPermissionDenied = async (
  error: unknown,
  queryPermission: PermissionQuery = queryBrowserPermission,
): Promise<boolean> => {
  if (
    typeof error !== "object" ||
    error === null ||
    !("name" in error) ||
    error.name !== "NotSupportedError"
  ) {
    return false;
  }

  try {
    const states = await Promise.all([
      queryPermission("microphone"),
      queryPermission("camera"),
    ]);
    return states.includes("denied");
  } catch {
    return false;
  }
};

export class UnknownCallError extends ElementCallError {
  public constructor(error: Error) {
    // Surface the underlying error's name + message in the UI so operators
    // testing on PreDev can triage without having to open DevTools. The raw
    // Error is still passed as `cause` for Sentry.
    const detail = [error.name, error.message]
      .map((s) => (s ?? "").trim())
      .filter((s) => s.length > 0)
      .join(": ");
    super(
      t("error.generic"),
      ErrorCode.UNKNOWN_ERROR,
      ErrorCategory.UNKNOWN,
      detail.length > 0
        ? t("error.unexpected_ec_error_with_details", {
            errorCode: ErrorCode.UNKNOWN_ERROR,
            details: detail,
          })
        : undefined,
      // Properly set it as a cause for a better reporting on sentry
      error,
    );
  }
}

/**
 * Raised when LiveKit or the JWT auth gateway rejects the widget's token
 * with 401/403. In ORISO this almost always means the caller is not a
 * current member of the Matrix room the gateway authorises against.
 */
export class LiveKitAuthDeniedError extends ElementCallError {
  public status: number;

  public constructor(status: number, cause?: Error) {
    super(
      t("error.livekit_auth_denied"),
      ErrorCode.LIVEKIT_AUTH_DENIED_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.livekit_auth_denied_description", { status }),
      cause,
    );
    this.status = status;
  }
}

/**
 * Raised when the JWT auth gateway (`/livekit/jwt/sfu/get`) returns 5xx or
 * cannot be reached. The gateway or its dependencies (Matrix federation,
 * Synapse OpenID validation) are unavailable — operators should look at
 * the JWT-service pod, its ingress, and the Matrix delegation before
 * touching call code.
 */
export class LiveKitJwtServiceUnavailableError extends ElementCallError {
  public status?: number;

  public constructor(status: number | undefined, cause?: Error) {
    super(
      t("error.livekit_jwt_service_unavailable"),
      ErrorCode.LIVEKIT_JWT_SERVICE_UNAVAILABLE,
      ErrorCategory.NETWORK_CONNECTIVITY,
      t("error.livekit_jwt_service_unavailable_description", {
        status: status ?? "network error",
      }),
      cause,
    );
    this.status = status;
  }
}

export class FailToGetOpenIdToken extends ElementCallError {
  public constructor(error: Error) {
    super(
      t("error.generic"),
      ErrorCode.OPEN_ID_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      undefined,
      // Properly set it as a cause for a better reporting on sentry
      error,
    );
  }
}

export class FailToStartLivekitConnection extends ElementCallError {
  public constructor(e?: string) {
    super(
      t("error.failed_to_start_livekit"),
      ErrorCode.FAILED_TO_START_LIVEKIT,
      ErrorCategory.NETWORK_CONNECTIVITY,
      e,
    );
  }
}

export class InsufficientCapacityError extends ElementCallError {
  public constructor() {
    super(
      t("error.insufficient_capacity"),
      ErrorCode.INSUFFICIENT_CAPACITY_ERROR,
      ErrorCategory.UNKNOWN,
      t("error.insufficient_capacity_description"),
    );
  }
}

export class SFURoomCreationRestrictedError extends ElementCallError {
  public constructor() {
    super(
      t("error.room_creation_restricted"),
      ErrorCode.SFU_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      t("error.room_creation_restricted_description"),
    );
  }
}
