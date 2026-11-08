import { ShowForm } from "@/components/studio-forms";
import { StudioPage } from "./studio-forms-pages";

export default function NewShow() {
  // A live video show needs no track, so the form is available even before the first upload.
  return <StudioPage title="Schedule a show">{({ tracks }) => <ShowForm tracks={tracks.map((t) => ({ id: t.id, title: t.title }))} />}</StudioPage>;
}
