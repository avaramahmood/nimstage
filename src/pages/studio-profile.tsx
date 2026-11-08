import { ArtworkEditor } from "@/components/artwork-editor";
import { ProfileForm } from "@/components/studio-forms";
import { readLinks } from "@shared/artist";
import { StudioPage } from "./studio-forms-pages";

export default function EditProfile() {
  return (
    <StudioPage title="Edit profile">
      {({ artist }) => (
        <div className="grid gap-8">
          <section aria-label="Artwork" className="card grid gap-5 p-5">
            <h2 className="display display-sm">Artwork</h2>
            <p className="-mt-3 text-sm text-muted">JPEG, PNG or WebP up to 5 MB. We resize it for phones and remove any location data. Without an image, NimStage makes a gradient for you.</p>
            <ArtworkEditor kind="avatar" id="me" seed={`${artist.id}-avatar`} current={artist.avatarKey} label="Profile picture" />
            <ArtworkEditor kind="banner" id="me" seed={artist.id} current={artist.bannerKey} label="Banner" />
          </section>
          <ProfileForm
            username={artist.handle}
            initial={{ handle: artist.handle, name: artist.name, bio: artist.bio, genre: artist.genre, payoutAddress: artist.payoutAddress, tagline: artist.tagline, accent: artist.accent, links: readLinks(artist.links) }}
          />
        </div>
      )}
    </StudioPage>
  );
}
