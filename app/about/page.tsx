import { LegalPage, LegalP } from "@/components/legal-page"

export const metadata = {
  title: "About Us — ChatAndTip",
  description: "ChatAndTip is a creator-engagement platform for discovering, connecting with, and supporting creators worldwide.",
}

export default function AboutPage() {
  return (
    <LegalPage title="About Us">
      <LegalP>
        ChatAndTip is a creator-engagement platform built to help people discover, connect with, and support Creators
        from all over the world. Whether you&apos;re browsing posts, exchanging messages, or booking a live voice or
        video session, ChatAndTip is designed to make real, meaningful interaction between Users and Creators simple
        and secure.
      </LegalP>
      <LegalP>
        ChatAndTip exists to celebrate creators and the communities that follow them — through shared interests,
        languages, and the content they love. Users can explore content, follow favorite Creators, join
        conversations, and show appreciation through tips, while Creators can build genuine relationships with their
        audience and earn from the connections they make.
      </LegalP>
      <LegalP>
        We&apos;re committed to a respectful, safe community. ChatAndTip does not condone nudity, racist views,
        slurs, extortion, and discrimination of any kind, and content or conduct that violates these standards is
        not tolerated on the Platform.
      </LegalP>
      <LegalP>
        Every feature, from our Access Key messaging system to scheduled VoiceCall and VideoCall Sessions, is built
        around trust, fairness, and safety. Payments and account management happen securely through in-app and
        chatandtip.com, keeping your data and transactions protected.
      </LegalP>
      <LegalP>
        At its core, ChatAndTip is about connection: giving Creators a platform to be seen and supported, and
        giving Users a genuine way to engage with people and content they care about.
      </LegalP>
    </LegalPage>
  )
}
