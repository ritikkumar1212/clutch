import type { SVGProps } from "react";
import ClutchMark from "./ClutchMark";

export interface ClutchAppIconProps extends Omit<SVGProps<SVGSVGElement>, "title"> {
  size?: number | string;
  title?: string;
}

/** The standalone rounded-square app icon version of the Clutch mark. */
export default function ClutchAppIcon({ size = 128, title = "Clutch", className, ...props }: ClutchAppIconProps) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="clutch-icon-surface" x1="12" y1="10" x2="116" y2="118" gradientUnits="userSpaceOnUse">
          <stop stopColor="#171717" />
          <stop offset="1" stopColor="#0B0B0B" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="124" height="124" rx="31" fill="url(#clutch-icon-surface)" />
      <rect x="2.5" y="2.5" width="123" height="123" rx="30.5" stroke="#302C29" />
      <ClutchMark
        x="8"
        y="27"
        width="112"
        height="75"
        color="#F2C6A3"
        background="#0B0B0B"
        gradient
        speedLines
        title=""
      />
    </svg>
  );
}
