import { InfoPage, Section } from "@/components/info-page";

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" summary="What NimStage stores about you, and what it doesn't." updated="8 November 2026">
      <Section title="What we store">
        <p>Your wallet address and display name; what you have paid for and when; the artists you follow; your poll votes; the messages you write in live chat; and artists&apos; profiles, tracks and shows. A signed-in session is kept in one cookie, which is needed to keep you signed in.</p>
      </Section>
      <Section title="What we don't do">
        <p>There are no ad trackers or analytics cookies. We don&apos;t ask for your email, phone number or real name, and we never see your wallet&apos;s keys.</p>
      </Section>
      <Section title="What is public">
        <p>NIM payments are recorded on the public Nimiq blockchain, including the sending and receiving addresses and the amount. That is how the network works and NimStage can&apos;t change it. Your live-chat messages are visible to other people in that show.</p>
      </Section>
      <Section title="Who handles the data">
        <p>The app runs on a hosting provider with a managed database and file storage, and live video is carried by a video-streaming provider. Your device&apos;s IP address is visible to those providers while you use the app.</p>
      </Section>
      <Section title="Your choices">
        <p>In Settings you can change your display name, download a copy of your data, or delete your account. Deleting removes your activity and signs you out. Payment records are kept without your name or wallet attached, because they are financial history shared with the artist.</p>
      </Section>
    </InfoPage>
  );
}
