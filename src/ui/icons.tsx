import type { SVGProps } from "react";

/*
 * Line icons on a 24 grid, drawn with currentColor. Decorative by default (aria-hidden).
 * Labels always come from the text next to them or from an aria-label on the control.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconToday = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 9.5c2.2 0 2.2-1.6 4.5-1.6S9.7 9.5 12 9.5s2.2-1.6 4.5-1.6S18.7 9.5 21 9.5" />
    <path d="M3 14.5c2.2 0 2.2-1.6 4.5-1.6s2.2 1.6 4.5 1.6 2.2-1.6 4.5-1.6 2.2 1.6 4.5 1.6" />
    <path d="M3 19.5c2.2 0 2.2-1.6 4.5-1.6s2.2 1.6 4.5 1.6 2.2-1.6 4.5-1.6 2.2 1.6 4.5 1.6" />
  </Icon>
);

export const IconInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 13.5 6.2 5.8A1.5 1.5 0 0 1 7.6 4.8h8.8a1.5 1.5 0 0 1 1.4 1l2.2 7.7" />
    <path d="M4 13.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-4.5h-4.2a3.8 3.8 0 0 1-7.6 0H4Z" />
  </Icon>
);

export const IconProjects = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l1.8 2H19a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
  </Icon>
);

export const IconNotes = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h10.5L19 8v11.5H5Z" />
    <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Icon>
);

export const IconUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 14.5 12 9l5.5 5.5" />
  </Icon>
);

export const IconDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 9.5 12 15l5.5-5.5" />
  </Icon>
);

export const IconFocus = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.5" />
  </Icon>
);

export const IconSnooze = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />
  </Icon>
);

export const IconEddy = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5a7.5 7.5 0 1 1-7.5 7.5" />
    <path d="M12 8.5a3.5 3.5 0 1 1-3.5 3.5" />
  </Icon>
);

export const IconDrop = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 6.5c4 0 7 2 7 6v7" />
    <path d="M12 12.5c0-3.5 2.6-5.5 7-5.5-.4 4-2.8 6-7 6Z" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6v12M15 6v12" />
  </Icon>
);

export const IconCalendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16M8.5 3.5v3M15.5 3.5v3" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12h14M13 6.5 18.5 12 13 17.5" />
  </Icon>
);
