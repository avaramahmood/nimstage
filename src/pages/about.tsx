import { InfoPage, Section } from "@/components/info-page";

export default function AboutPage() {
  return (
    <InfoPage title="About NimStage" summary="Tickets, premieres and fan memberships for independent musicians, paid in NIM inside Nimiq Pay.">
      <Section title="What it is">
        <p>Artists put on live video shows and audio premieres, sell tracks, and offer 30-day fan memberships. Fans pay with NIM from their own wallet. Everything costs 5 NIM or less, so supporting a small artist is a small decision.</p>
      </Section>
      <Section title="Where the money goes">
        <p>Straight from the fan&apos;s wallet to the artist&apos;s wallet. NimStage doesn&apos;t hold funds and takes no fee. Every payment is checked on the Nimiq network before access unlocks.</p>
      </Section>
      <Section title="Open source">
        <p>NimStage is released under the MIT License. It is a mini app for Nimiq Pay, built for the Nimiq Mini Apps Competition.</p>
      </Section>
    </InfoPage>
  );
}
