import type { CSSProperties, HTMLAttributes } from "react";

export interface ClutchMotionLogoProps extends Omit<HTMLAttributes<HTMLSpanElement>, "title"> {
  width?: number | string;
  height?: number | string;
  src?: string;
  title?: string;
  /** Compatibility props for older mark placements that still pass these values. */
  size?: number;
  background?: string;
  gradient?: boolean;
}

/**
 * Exact reference-image mark, clipped to the logo area.
 * The source image has a large black canvas around the mark, so the image is
 * positioned inside a small overflow-hidden wrapper rather than being scaled
 * as a whole. This keeps both interlocking halves visible at header size.
 */
export default function ClutchMotionLogo({
  width = 54,
  height = 27,
  src = "/branding/clutch-motion-reference.jpeg",
  title = "Clutch Motion Variant",
  size: _size,
  background: _background,
  gradient: _gradient,
  className,
  style,
  ...props
}: ClutchMotionLogoProps) {
  return (
    <span
      {...props}
      className={className}
      style={
        {
          position: "relative",
          display: "inline-block",
          width,
          height,
          overflow: "hidden",
          flexShrink: 0,
          ...style,
        } as CSSProperties
      }
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-67.6470588%",
          top: "-32.8125%",
          width: "235.2941176%",
          maxWidth: "none",
          // The supplied JPEG is 1600x533, not 1600x900. Keeping its real
          // ratio is what preserves the lower half of the interlocking mark.
          height: "166.5625%",
          display: "block",
          userSelect: "none",
        }}
      />
    </span>
  );
}
