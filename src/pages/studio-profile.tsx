import { ProfileForm } from "@/components/studio-forms";
import { StudioPage } from "./studio-forms-pages";

export default function EditProfile() {
  return (
    <StudioPage title="Edit profile">
      {({ artist }) => <ProfileForm initial={{ handle: artist.handle, name: artist.name, bio: artist.bio, genre: artist.genre, payoutAddress: artist.payoutAddress }} />}
    </StudioPage>
  );
}
