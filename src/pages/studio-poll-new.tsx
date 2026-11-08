import { PollForm } from "@/components/studio-forms";
import { StudioPage } from "./studio-forms-pages";

export default function NewPoll() {
  return (
    <StudioPage title="Start a poll" intro="Let your fans pick the setlist, the next single, anything. Results update live.">
      {({ tiers }) => <PollForm tiers={tiers.map((t) => ({ id: t.id, name: t.name }))} />}
    </StudioPage>
  );
}
