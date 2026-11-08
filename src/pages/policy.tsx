import { useTitle } from "@/lib/use-now";

export default function PolicyPage() {
  useTitle("Content & rights policy");
  return (
    <article className="wrap max-w-3xl pt-6 md:pt-8">
      <h1 className="display display-lg">Content &amp; rights</h1>
      <div className="mt-4 grid max-w-[60ch] gap-5 text-muted">
        <section>
          <h2 className="display display-sm text-ink">Original music only</h2>
          <p className="mt-1">Upload only music you wrote and own, or have written permission to sell. No covers, samples or remixes without the rights holder&apos;s consent. Uploading requires confirming this.</p>
        </section>
        <section>
          <h2 className="display display-sm text-ink">What isn&apos;t allowed</h2>
          <p className="mt-1">Sexually explicit content, hate speech, scams, misleading listings, malware, or anything illegal. Fan memberships are for music, behind-the-scenes posts and exclusive tracks.</p>
        </section>
        <section>
          <h2 className="display display-sm text-ink">Takedowns</h2>
          <p className="mt-1">Anyone signed in can report a track, show, post or artist. Admins review reports, and content found to break these rules is removed and repeat offenders are suspended. Rights holders can use the same Report button and choose “copyright”.</p>
        </section>
        <section>
          <h2 className="display display-sm text-ink">Your money</h2>
          <p className="mt-1">Payments go directly from the fan&apos;s wallet to the artist&apos;s wallet. NimStage never holds funds and takes no fee. Every payment is checked on the Nimiq network before access unlocks.</p>
        </section>
        <section>
          <h2 className="display display-sm text-ink">Open source</h2>
          <p className="mt-1">NimStage is released under the MIT License.</p>
        </section>
      </div>
    </article>
  );
}
