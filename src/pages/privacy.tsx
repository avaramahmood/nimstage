import { InfoPage, Section } from "@/components/info-page";

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" summary="What NimStage stores about you, and what it doesn't." updated="8 November 2026">
      <Section title="What we store">
        <p>Your wallet address; the username, display name, picture, banner, bio, links and accent colour you choose; what you have paid for and when; the artists you follow; your poll votes; the messages you write in live chat; and artists&apos; profiles, tracks and shows. To keep you signed in, a session token is kept in a cookie and also saved on your device (in your browser storage). Signing out removes both.</p>
      </Section>
      <Section title="What we don't do">
        <p>There are no ad trackers or analytics cookies. We don&apos;t ask for your email, phone number or real name, and we never see your wallet&apos;s keys.</p>
      </Section>
      <Section title="What is public">
        <p>Your profile at /u/your-username is public: your username, name, picture, banner, bio, links and the artists you follow, plus your Fan Pass level and badges unless you switch that off. Your wallet address and purchases are never shown on it. Your live-chat messages, with your name and username, are visible to other people in that show.</p>
        <p>NIM payments are recorded on the public Nimiq blockchain, including the sending and receiving addresses and the amount. That is how the network works and NimStage can&apos;t change it.</p>
      </Section>
      <Section title="Who handles the data">
        <p>The app runs on a hosting provider with a managed database and file storage, and live video is carried by a video-streaming provider. Your device&apos;s IP address is visible to those providers while you use the app.</p>
      </Section>
      <Section title="Your choices">
        <p>Under Me → Edit profile you can change your profile, hide your Fan Pass, or change your username (once a week). In Settings you can download a copy of your data or delete your account. Deleting frees your username, removes your profile and activity, and signs you out. Payment records are kept without your name or wallet attached, because they are financial history shared with the artist.</p>
      </Section>
    </InfoPage>
  );
}
