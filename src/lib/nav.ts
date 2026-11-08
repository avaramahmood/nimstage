// Tiny navigation helpers with the same shape the components already use.
// `refresh()` re-fetches every active query: the SPA equivalent of a server re-render.
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

export function useRouter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMemo(
    () => ({
      push: (to: string) => void navigate(to),
      refresh: () => void qc.invalidateQueries(),
    }),
    [navigate, qc],
  );
}

export const usePathname = () => useLocation().pathname;
