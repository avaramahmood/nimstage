import { PostForm } from "@/components/studio-forms";
import { StudioPage } from "./studio-forms-pages";

export default function NewPost() {
  return <StudioPage title="New post">{({ tiers }) => <PostForm tiers={tiers.map((t) => ({ id: t.id, name: t.name }))} />}</StudioPage>;
}
