import { TierForm } from "@/components/studio-forms";
import { formatNim } from "@shared/units";
import { StudioPage } from "./studio-forms-pages";

export default function TiersPage() {
  return (
    <StudioPage title="Fan tiers" intro="Supporters pay every 30 days and unlock all your shows, tracks and supporter posts. Up to three tiers.">
      {({ tiers }) => (
        <>
          {tiers.length > 0 && (
            <ul className="mb-6">
              {tiers.map((t) => (
                <li key={t.id} className="border-b border-line py-2">{t.name} · {formatNim(t.priceLuna)}</li>
              ))}
            </ul>
          )}
          {tiers.length < 3 ? <TierForm /> : <p className="text-muted">You&apos;ve reached the three-tier limit. Remove one from the Studio to add another.</p>}
        </>
      )}
    </StudioPage>
  );
}
