/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FC,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import classNames from "classnames";

import styles from "./ChatMenuDropdown.module.css";

/*
 * The ORISO menu card, as ORISO-Frontend has it in
 * `src/components/chatMenuDropdown/`: same parts, same names, same numbers
 * (card, header, divider, section, item with the 8 % brand wash on hover,
 * focus and the active one). It is rebuilt here because the call is a
 * separate app that cannot import the Frontend's components. Keep the two
 * in step; when the call can share a package, this file goes away.
 *
 * The one difference from the Frontend's card: this one is placed by its
 * host (`className`), because it opens upward from a field, not from a
 * button at the top of a list.
 */

interface DropdownProps {
  ref?: Ref<HTMLDivElement>;
  id?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  role?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

export const ChatMenuDropdown: FC<DropdownProps> = ({
  ref,
  id,
  children,
  className,
  style,
  ariaLabel,
  role = "dialog",
  onKeyDown,
}) => (
  <div
    id={id}
    ref={ref}
    className={classNames(styles.chatMenuDropdown, className)}
    style={style}
    role={role}
    aria-label={ariaLabel}
    onKeyDown={onKeyDown}
  >
    {children}
  </div>
);

export const ChatMenuDropdownHeader: FC<{
  subtitle: string;
  title: string;
}> = ({ subtitle, title }) => (
  <div className={styles.chatMenuDropdown__header}>
    <p className={styles.chatMenuDropdown__subtitle}>{subtitle}</p>
    <h2 className={styles.chatMenuDropdown__title}>{title}</h2>
  </div>
);

export const ChatMenuDropdownDivider: FC = () => (
  <div className={styles.chatMenuDropdown__divider} role="separator" />
);

export const ChatMenuDropdownSection: FC<{
  children: ReactNode;
  /** "radiogroup" when the items are a choice of one. */
  role?: string;
  ariaLabel?: string;
}> = ({ children, role, ariaLabel }) => (
  <div
    className={styles.chatMenuDropdown__section}
    role={role}
    aria-label={ariaLabel}
  >
    {children}
  </div>
);

interface ItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> {
  ref?: Ref<HTMLButtonElement>;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  active?: boolean;
}

export const ChatMenuDropdownItem: FC<ItemProps> = ({
  icon,
  title,
  description,
  active = false,
  className,
  ...rest
}) => (
  <button
    type="button"
    {...rest}
    className={classNames(
      styles.chatMenuDropdown__item,
      active && styles["chatMenuDropdown__item--active"],
      className,
    )}
  >
    {icon && <span className={styles.chatMenuDropdown__itemIcon}>{icon}</span>}
    <span className={styles.chatMenuDropdown__itemCenter}>
      <span className={styles.chatMenuDropdown__itemTitle}>{title}</span>
      {description && (
        <span className={styles.chatMenuDropdown__itemDescription}>
          {description}
        </span>
      )}
    </span>
  </button>
);
