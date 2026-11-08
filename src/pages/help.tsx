import { InfoPage, Section } from "@/components/info-page";

export default function HelpPage() {
  return (
    <InfoPage title="Help" summary="Short answers to the things people ask first.">
      <Section title="How do I sign in?">
        <p>Open NimStage from the Mini Apps section of Nimiq Pay and tap Sign in. You sign a one-time message with your wallet. There is no password or email, and signing in never spends NIM.</p>
      </Section>
      <Section title="Username and profile">
        <p>The first time you sign in you choose a username, your public @handle. It is never your wallet address. You can add a picture, banner, bio, links and an accent colour there too, and change them any time under Me → Edit profile. You can change your username once a week. Artists use the same username as their artist page address.</p>
      </Section>
      <Section title="How do I pay?">
        <p>Tap a ticket, track or membership, then confirm the payment in Nimiq Pay. Access unlocks once the payment is confirmed on the Nimiq network, which usually takes a short while. Nothing costs more than 5 NIM.</p>
      </Section>
      <Section title="I paid but nothing unlocked">
        <p>Wait a minute and refresh the page. The Receipts page (under Me) lists confirmed payments. If a payment is missing there, check your wallet history before paying again.</p>
      </Section>
      <Section title="Can I get a refund?">
        <p>Payments on the Nimiq network can&apos;t be reversed by NimStage, and the money goes directly to the artist. If something was misdescribed or breaks the rules, use the Report button on the page so it can be reviewed.</p>
      </Section>
      <Section title="Live shows">
        <p>Live video shows open to ticket holders and supporters shortly before the start time. If you can&apos;t hear the stream, tap the button under the video. Premieres are pre-recorded audio played at the scheduled time.</p>
      </Section>
      <Section title="I'm an artist">
        <p>Open the Studio tab to create your profile with a payout address, upload MP3 tracks, schedule shows, post to supporters and set up membership tiers. Double-check your payout address: payments can&apos;t be reversed.</p>
      </Section>
      <Section title="Deleting my account">
        <p>Go to Me, then Settings. You can download your data first. Deleting removes your activity and signs you out everywhere. Payment records are kept without your name or wallet attached.</p>
      </Section>
    </InfoPage>
  );
}
