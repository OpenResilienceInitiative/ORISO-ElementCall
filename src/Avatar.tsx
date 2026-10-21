/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useMemo,
  type FC,
  type CSSProperties,
  useState,
  useEffect,
} from "react";
import { Avatar as CompoundAvatar } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/lib/logger";

import { useClientState } from "./ClientContext";

export enum Size {
  XS = "xs",
  SM = "sm",
  MD = "md",
  LG = "lg",
  XL = "xl",
}

export const sizes = new Map([
  [Size.XS, 22],
  [Size.SM, 32],
  [Size.MD, 36],
  [Size.LG, 42],
  [Size.XL, 90],
]);

export interface Props {
  id: string;
  name: string;
  className?: string;
  src?: string;
  size?: Size | number;
  style?: CSSProperties;
}

export const Avatar: FC<Props> = ({
  className,
  id,
  name,
  src,
  size = Size.MD,
  style,
  ...props
}) => {
  const clientState = useClientState();

  const sizePx = useMemo(
    () =>
      Object.values(Size).includes(size as Size)
        ? sizes.get(size as Size)
        : (size as number),
    [size],
  );

  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (clientState?.state !== "valid") {
      return;
    }
    // `fetchMedia` abstracts over the two routes to authenticated media: our
    // own token in SPA mode, and MSC4039 through the host in widget mode. It
    // is null only when neither is available.
    const { fetchMedia } = clientState;

    if (!fetchMedia || !src || !sizePx) {
      return;
    }

    let objectUrl: string | undefined;
    let cancelled = false;

    fetchMedia(src, sizePx)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setAvatarUrl(undefined);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch((error) => {
        logger.debug(`Could not load avatar ${src}`, error);
        if (!cancelled) setAvatarUrl(undefined);
      });

    return (): void => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [clientState, src, sizePx]);

  return (
    <CompoundAvatar
      className={className}
      id={id}
      name={name}
      size={`${sizePx}px`}
      src={avatarUrl}
      style={style}
      {...props}
    />
  );
};
