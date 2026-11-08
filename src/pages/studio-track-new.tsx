import { TrackForm } from "@/components/studio-forms";
import { StudioPage } from "./studio-forms-pages";

export default function NewTrack() {
  return <StudioPage title="Upload a track">{() => <TrackForm />}</StudioPage>;
}
