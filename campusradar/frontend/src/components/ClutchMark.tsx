import { useId, type SVGProps } from "react";

export interface ClutchMarkProps extends Omit<SVGProps<SVGSVGElement>, "color" | "title"> {
  /** Rendered width and height. The viewBox remains square-ish and scales cleanly. */
  size?: number | string;
  /** Main mark and motion-line color. */
  color?: string;
  /** Color used for the tiny weave separators at the over-under points. */
  background?: string;
  /** Set to false when the mark is used without motion lines. */
  speedLines?: boolean;
  /** Adds the restrained peach-to-deeper-peach finish used by the app icon. */
  gradient?: boolean;
  title?: string;
}

/**
 * Clutch's motion-interlock C mark.
 *
 * The two opposing C paths share the center, with small background separators
 * making the over-under weave readable at small sizes. The wordmark is kept
 * outside this component so the symbol can be used as an app icon.
 */
export default function ClutchMark({
  size = 44,
  color = "currentColor",
  background = "#0B0B0B",
  speedLines = true,
  gradient = true,
  title = "Clutch",
  className,
  ...props
}: ClutchMarkProps) {
  const gradientId = `clutch-peach-${useId().replace(/:/g, "")}`;
  const paint = gradient ? `url(#${gradientId})` : color;
  const svgWidth = props.width ?? size;
  const svgHeight = props.height ?? size;

  return (
    <svg
      {...props}
      width={svgWidth}
      height={svgHeight}
      viewBox="0 0 96 64"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}

      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={color} />
            <stop offset="1" stopColor="#D99E77" />
          </linearGradient>
        </defs>
      )}

      {speedLines && (
        <g stroke={paint} strokeLinecap="round" opacity="0.92">
          <path d="M4 21h10" strokeWidth="3" />
          <path d="M1 32h15" strokeWidth="3" />
          <path d="M6 43h8" strokeWidth="3" />
          <circle cx="9" cy="13" r="1.5" fill={paint} stroke="none" />
          <circle cx="3" cy="51" r="1.25" fill={paint} stroke="none" />
        </g>
      )}

      <g stroke={paint} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round">
        {/* Normal C with a curled lower arm crossing the center. */}
        <path d="M67 15H45C31 15 22 22 22 32s9 17 23 17h14c8 0 12-4 12-10" />
        {/* Mirrored C with the opposing curled arm. */}
        <path d="M55 15h22c14 0 23 7 23 17s-9 17-23 17H63c-8 0-12-4-12-10" />
      </g>

      {background !== "none" && (
        <g stroke={background} strokeLinecap="round">
          {/* Small breaks imply alternating over-under passes without a hard seam. */}
          <path d="M59 12v7" strokeWidth="2.25" />
          <path d="M59 45v7" strokeWidth="2.25" />
        </g>
      )}
    </svg>
  );
}
