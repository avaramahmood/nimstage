import { InfoPage, Section } from "@/components/info-page";

export default function TermsPage() {
  return (
    <InfoPage title="Terms of use" summary="A plain-language summary of the rules. It is not legal advice." updated="8 November 2026">
      <Section title="Using NimStage">
        <p>You may use NimStage if you can legally use Nimiq Pay where you live. You are responsible for your wallet and for anything you do with it.</p>
      </Section>
      <Section title="Payments">
        <p>Payments are made in NIM directly between your wallet and the artist&apos;s wallet. NimStage doesn&apos;t hold or transfer your funds and charges no fee. Blockchain payments can&apos;t be reversed by NimStage. Prices are capped at 5 NIM.</p>
      </Section>
      <Section title="What you buy">
        <p>A ticket gives access to one show. A track purchase gives access to that track. A membership gives access to that artist&apos;s content for 30 days. Access is for your personal use: don&apos;t record, rebroadcast or share it.</p>
      </Section>
      <Section title="Artists">
        <p>Artists must own, or have permission to sell, everything they upload or stream, and agree to the content and rights policy. Artists are responsible for their content and their payout address.</p>
      </Section>
      <Section title="Conduct and removal">
        <p>Don&apos;t post unlawful, abusive or misleading content, spam the live room, or try to bypass access limits. Content or accounts that break these rules can be removed or suspended.</p>
      </Section>
      <Section title="No guarantees">
        <p>NimStage is provided as is. Live shows depend on networks and devices outside our control and may fail or be interrupted. To the extent the law allows, NimStage isn&apos;t liable for losses arising from its use.</p>
      </Section>
      <Section title="Changes">
        <p>These terms may change. Continuing to use NimStage after a change means you accept it.</p>
      </Section>
    </InfoPage>
  );
}
