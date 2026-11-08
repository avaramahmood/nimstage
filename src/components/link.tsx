import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link as RouterLink } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchRoute } from "@/lib/queries";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

/**
 * Client-side link. Hovering, focusing or touching it starts loading that page's data, so by the
 * time you click, the page is usually already there (this is most of why the SPA feels instant).
 */
export const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, onPointerEnter, onFocus, onTouchStart, ...rest }, ref) {
  const qc = useQueryClient();
  const warm = () => prefetchRoute(qc, href);
  return (
    <RouterLink
      ref={ref}
      to={href}
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
});
