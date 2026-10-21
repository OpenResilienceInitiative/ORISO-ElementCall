/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk";
import { type FC, type PropsWithChildren } from "react";

import { ClientContextProvider } from "./ClientContext";
import { Avatar } from "./Avatar";
import { mockMatrixRoomMember, mockRtcMembership } from "./utils/test";
import {
  createHomeserverMediaFetcher,
  createWidgetMediaFetcher,
  type MediaFetcher,
} from "./utils/matrixMedia";

const TestComponent: FC<
  PropsWithChildren<{
    client: MatrixClient;
    supportsThumbnails?: boolean;
    fetchMedia?: MediaFetcher | null;
  }>
> = ({ client, children, supportsThumbnails, fetchMedia }) => {
  return (
    <ClientContextProvider
      value={{
        state: "valid",
        disconnected: false,
        supportedFeatures: {
          reactions: true,
          thumbnails: supportsThumbnails ?? true,
        },
        fetchMedia:
          fetchMedia === undefined
            ? createHomeserverMediaFetcher(client)
            : fetchMedia,
        setClient: vi.fn(),
        authenticated: {
          client,
          isPasswordlessUser: true,
          changePassword: vi.fn(),
          logout: vi.fn(),
        },
      }}
    >
      {children}
    </ClientContextProvider>
  );
};

/**
 * vitest has no implementation of create/revokeObjectURL, so we delete the
 * property first. It's a bit odd, but it works.
 */
function stubObjectUrl(value: string): void {
  Reflect.deleteProperty(global.window.URL, "createObjectURL");
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue(value);
  Reflect.deleteProperty(global.window.URL, "revokeObjectURL");
  globalThis.URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("should just render a placeholder when the user has no avatar", () => {
  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => "my-access-token",
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);

  vi.spyOn(client, "mxcUrlToHttp");
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => undefined,
    },
  );
  render(
    <TestComponent client={client}>
      <Avatar
        id={member.userId}
        name="Alice"
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );
  const element = screen.getByRole("img", { name: "@alice:example.org" });
  expect(element.tagName).toEqual("SPAN");
  expect(client.mxcUrlToHttp).toBeCalledTimes(0);
});

test("should just render a placeholder when no media route is available", () => {
  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => "my-access-token",
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);

  vi.spyOn(client, "mxcUrlToHttp");
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => "mxc://example.org/alice-avatar",
    },
  );
  render(
    // This is the widget case where the host refused MSC4039: no fetcher at
    // all, so we must not attempt a request.
    <TestComponent client={client} supportsThumbnails={false} fetchMedia={null}>
      <Avatar
        id={member.userId}
        name="Alice"
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );
  const element = screen.getByRole("img", { name: "@alice:example.org" });
  expect(element.tagName).toEqual("SPAN");
  expect(client.mxcUrlToHttp).toBeCalledTimes(0);
});

test("should attempt to fetch authenticated media", async () => {
  const expectedAuthUrl = "http://example.org/media/alice-avatar";
  const expectedObjectURL = "my-object-url";
  const accessToken = "my-access-token";
  const theBlob = new Blob([]);

  stubObjectUrl(expectedObjectURL);

  const fetchFn = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => Promise.resolve(theBlob),
  });
  vi.stubGlobal("fetch", fetchFn);

  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => accessToken,
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);

  vi.spyOn(client, "mxcUrlToHttp").mockReturnValue(expectedAuthUrl);
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => "mxc://example.org/alice-avatar",
    },
  );
  render(
    <TestComponent client={client}>
      <Avatar
        id={member.userId}
        name="Alice"
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );

  // Fetch is asynchronous, so wait for this to resolve.
  await vi.waitUntil(() =>
    document.querySelector(`img[src='${expectedObjectURL}']`),
  );

  expect(client.mxcUrlToHttp).toBeCalledTimes(1);
  // `useAuthentication` (the last argument) must be true, otherwise this would
  // resolve to the legacy unauthenticated media endpoint.
  expect(client.mxcUrlToHttp).toBeCalledWith(
    "mxc://example.org/alice-avatar",
    96,
    96,
    "crop",
    false,
    true,
    true,
  );
  expect(globalThis.fetch).toBeCalledWith(expectedAuthUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
});

test("should fetch avatars through the widget API when running as a widget", async () => {
  const expectedObjectURL = "widget-object-url";
  stubObjectUrl(expectedObjectURL);

  // A widget owns no access token at all — that is the whole point of
  // matryoshka mode — so the SPA route is unavailable here.
  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => null,
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);
  vi.spyOn(client, "mxcUrlToHttp");

  const fetchFn = vi.fn();
  vi.stubGlobal("fetch", fetchFn);

  const downloadFile = vi
    .fn()
    .mockResolvedValue({ file: new Blob([new Uint8Array([1, 2, 3])]) });
  const widgetApi = { downloadFile } as unknown as Parameters<
    typeof createWidgetMediaFetcher
  >[0];

  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => "mxc://example.org/alice-avatar",
    },
  );

  render(
    <TestComponent
      client={client}
      supportsThumbnails={false}
      fetchMedia={createWidgetMediaFetcher(widgetApi)}
    >
      <Avatar
        id={member.userId}
        name="Alice"
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );

  await vi.waitUntil(() =>
    document.querySelector(`img[src='${expectedObjectURL}']`),
  );

  expect(downloadFile).toBeCalledWith("mxc://example.org/alice-avatar");
  // Nothing may be requested over HTTP from inside the widget: it has no
  // credentials, so any direct media fetch would either fail or (worse) hit an
  // unauthenticated endpoint.
  expect(globalThis.fetch).toBeCalledTimes(0);
  expect(client.mxcUrlToHttp).toBeCalledTimes(0);
});

test("should not ask the host for a non-mxc source", async () => {
  stubObjectUrl("unused");
  const downloadFile = vi.fn();
  const widgetApi = { downloadFile } as unknown as Parameters<
    typeof createWidgetMediaFetcher
  >[0];

  const fetcher = createWidgetMediaFetcher(widgetApi);
  await expect(
    fetcher("https://evil.example.com/tracker.png", 96),
  ).resolves.toBeNull();
  expect(downloadFile).toBeCalledTimes(0);
});
