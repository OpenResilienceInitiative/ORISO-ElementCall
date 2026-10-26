/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useTranslation } from "react-i18next";
import { type FC } from "react";

import { useClientState } from "../ClientContext";
import { ErrorPage, FullScreenView, LoadingPage } from "../FullScreenView";
import { UnauthenticatedView } from "./UnauthenticatedView";
import { RegisteredView } from "./RegisteredView";
import { usePageTitle } from "../usePageTitle";
import { widget } from "../widget.ts";

export const HomePage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("common.home"));
  const isEmbedded = window.self !== window.top;

  // Above the early return, because a hook after one is a hook that runs in
  // some renders and not others. `isEmbedded` happens to be constant for the
  // life of the app, so this never actually misbehaved — but the rule is
  // there for the day it is not, and reading a context costs nothing.
  const clientState = useClientState();

  // In embedded integrations, we never want to show standalone
  // "Start new call" home surfaces (branding/login/create call).
  if (isEmbedded) {
    return <FullScreenView />;
  }

  if (!clientState) {
    return <LoadingPage />;
  } else if (clientState.state === "error") {
    return <ErrorPage widget={widget} error={clientState.error} />;
  } else {
    return clientState.authenticated ? (
      <RegisteredView client={clientState.authenticated.client} />
    ) : (
      <UnauthenticatedView />
    );
  }
};
