import type { SVGProps } from "react";

/** Small stroke icons for the HUD (24×24 grid, currentColor). */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const RocketIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2" />
    <path d="M9 18l-3-3c1-3.5 4-9.5 12-11 0 0 .5 8-11 14z" />
    <circle cx="14.5" cy="9.5" r="1.5" />
  </Icon>
);
export const TruckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z" />
    <circle cx="6" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </Icon>
);
export const WarehouseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 9l9-5 9 5v11H3z" />
    <path d="M7 20v-7h10v7M7 16h10" />
  </Icon>
);
export const CapIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 9l10-5 10 5-10 5z" />
    <path d="M6 11v5c3 2.5 9 2.5 12 0v-5M21 9v5" />
  </Icon>
);
export const ChartIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);
export const WalletIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H3z" />
    <path d="M3 7V5a1 1 0 011-1h12v3M16 13.5h2" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Icon>
);
export const FilterIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8v6l-4-2v-4z" />
  </Icon>
);
export const ListIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);
export const MapIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
);
export const CrateIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </Icon>
);
export const ImageIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);

/** CoinPort mark: stacked amber layers, as in the concept. */
export function LogoMark(p: P) {
  return (
    <svg viewBox="0 0 40 40" width="1em" height="1em" aria-hidden="true" {...p}>
      <path d="M20 4l15 8-15 8-15-8z" fill="#ffb13b" />
      <path d="M5 18.5l15 8 15-8" fill="none" stroke="#ff8c1a" strokeWidth="3" strokeLinejoin="round" />
      <path d="M5 25.5l15 8 15-8" fill="none" stroke="#c96d1b" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
