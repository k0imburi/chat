import { LegalPage, LegalH2, LegalP, LegalUl } from "@/components/legal-page"

export const metadata = {
  title: "Privacy Policy — ChatAndTip",
  description: "How ChatAndTip collects, uses, discloses, and protects your information.",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="2 March 2026">
      <LegalP>
        This Privacy Policy explains how ChatAndTip (&quot;ChatAndTip,&quot; &quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) collects, uses, discloses, and protects information when you use our mobile application
        and our website chatandtip.com (collectively, the &quot;Platform&quot;). By using the Platform, you agree
        to the collection and use of information as described in this Policy.
      </LegalP>

      <section className="space-y-3">
        <LegalH2>1. Information We Collect</LegalH2>
        <LegalP>We collect the following categories of information:</LegalP>
        <LegalUl>
          <li><strong>Account information:</strong> name, username, email address, date of birth, password, languages spoken, and profile details you provide. Note that a User&apos;s or Creator&apos;s date of birth, email address, passwords, and location are not displayed publicly on the Platform.</li>
          <li><strong>Identity and payout verification information:</strong> government-issued ID (front and back) and a verification selfie, collected from Creators to confirm age and identity and, prior to any payout, to verify eligibility to receive funds. This data is not stored on our servers; it is specifically used to verify identity.</li>
          <li><strong>Payment information:</strong> billing and mobile-money details (including M-PESA) processed by our third-party payment processors in-app and on chatandtip.com. We do not store full payment card numbers on our own servers.</li>
          <li><strong>Content:</strong> photos, videos, reels, captions, descriptions, hashtags, tags, comments, and other material you upload or post through the Platform.</li>
          <li><strong>Messaging and Session data:</strong> metadata about direct messages, VoiceCall Sessions, and VideoCall Sessions, such as timestamps, duration, scheduling requests, approvals, no-shows, and strikes. We do not routinely record call audio or video content, except as described in Section 4.</li>
          <li><strong>Transaction and Wallet data:</strong> purchases of Access Keys, ChatCredits, VoiceCall Sessions, and VideoCall Sessions; Tips (Pebbles, Gems, Diamonds) sent or received; Wallet balances; and payout history.</li>
          <li><strong>Device and usage data:</strong> IP address, device identifiers, browser type, operating system, log data, and analytics about how you interact with the Platform, including notifications, likes, shares, views, and comments.</li>
          <li><strong>Location data:</strong> approximate location derived from your IP address, used for security, fraud prevention, currency localization, and legal compliance — not displayed to other Users.</li>
        </LegalUl>
      </section>

      <section className="space-y-3">
        <LegalH2>2. How We Use Information</LegalH2>
        <LegalP>We use the information we collect to:</LegalP>
        <LegalUl>
          <li>Create and manage your account and verify your identity and age.</li>
          <li>Operate core features, including messaging (Access Keys/ChatCredits), VoiceCall and VideoCall Session scheduling, reels and Content delivery, comments, and the Tipping system.</li>
          <li>Process purchases of Virtual Currency, manage Wallet balances, and issue Creator payouts, including verifying identity documents before releasing funds.</li>
          <li>Maintain the safety and integrity of the Platform, including detecting fraud, abuse, excessive tipping patterns that trigger manual verification, and violations of our Terms and Community Guidelines (including nudity policy violations reported during Sessions).</li>
          <li>Administer the no-show and strike system for Sessions, including issuing notifications, fines, refunds, and account restrictions.</li>
          <li>Communicate with you about your account, bookings, transactions, and updates to our policies.</li>
          <li>Personalize content recommendations (such as trending reels and subject/language filters) and improve Platform features.</li>
          <li>Comply with legal obligations, including tax reporting for Creator earnings, anti-money-laundering checks, and responses to lawful requests from authorities.</li>
        </LegalUl>
      </section>

      <section className="space-y-3">
        <LegalH2>3. How We Share Information</LegalH2>
        <LegalP>We do not sell your personal information. We may share information in the following circumstances:</LegalP>
        <LegalUl>
          <li>With payment processors and mobile-money partners (including M-PESA) and identity verification providers to complete transactions, process payouts, and confirm age and identity.</li>
          <li>With other Users or Creators, limited to information you choose to make visible, such as your username, profile details you opt to display, and Content you post — excluding age and precise location, which are not shown.</li>
          <li>With service providers who support hosting, analytics, customer support, notifications, and fraud prevention, under confidentiality obligations.</li>
          <li>With law enforcement or regulators where required by law, to protect the rights and safety of Users, Creators, or the public, or to investigate suspected violations involving minors, non-consensual content, or financial fraud.</li>
          <li>In connection with a merger, acquisition, or sale of assets, subject to this Policy or a successor policy.</li>
        </LegalUl>
      </section>

      <section className="space-y-3">
        <LegalH2>4. Messages and Sessions</LegalH2>
        <LegalP>
          We collect metadata about direct messages (including IceBreaker and follow-up exchanges) and about
          VoiceCall/VideoCall Sessions (such as scheduling, duration, no-shows, and strikes) to operate billing,
          scheduling, and safety features. We do not routinely store the audio or video content of Sessions.
          However, the creator and/or the user can voluntarily record the voice or video call sessions. Such
          recordings can be used as material supporting policy violation claims. ChatAndTip may review the
          material to assess the claims and take the most appropriate actions. ChatAndTip may retain relevant
          records of that Session for as long as needed to resolve the review and comply with legal obligations.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>5. Cookies and Tracking Technologies</LegalH2>
        <LegalP>
          We use cookies, SDKs, and similar technologies on the app and on chatandtip.com to keep you logged in,
          remember preferences (such as subject and language filters), measure Platform performance, and deliver
          relevant content. You can control cookies through your browser or device settings; disabling certain
          cookies may limit Platform functionality, including on chatandtip.com&apos;s Wallet features.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>6. Data Retention</LegalH2>
        <LegalP>
          We retain personal information for as long as your account is active and as needed to provide the
          Platform, comply with legal obligations (including recordkeeping related to age verification, payouts,
          and financial transactions), resolve disputes (including Sessions placed Under Review), and enforce our
          agreements. Identity and payout verification records for Creators may be retained for the period
          required by applicable law even after account closure.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>7. Data Security</LegalH2>
        <LegalP>
          We use administrative, technical, and physical safeguards designed to protect your information,
          including encryption in transit, access controls, and regular security review. No method of transmission
          or storage is completely secure, and we cannot guarantee absolute security.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>8. Your Rights and Choices</LegalH2>
        <LegalP>
          Depending on your location, you may have rights to access, correct, delete, or port your personal
          information, or to object to or restrict certain processing. You can update most account information
          directly in Account Settings, manage payment details and Wallet information in-app and on
          chatandtip.com, or contact us using the details in Section 12 to exercise these rights. We will verify
          your identity before fulfilling certain requests, particularly those relating to Wallet or payout data.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>9. Children&apos;s Privacy</LegalH2>
        <LegalP>
          The Platform is not directed to, and is not intended for use by, anyone under the age of 18. We do not
          knowingly collect personal information from anyone under 18. If we learn that we have collected
          information from someone under 18, we will delete it and take appropriate action, which include
          terminating the associated account.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>10. International Data Transfers</LegalH2>
        <LegalP>
          Your information may be transferred to, stored, and processed in countries other than your own, where
          our servers and service providers operate. Where required, we use appropriate safeguards for such
          transfers, such as standard contractual clauses.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>11. Changes to This Policy</LegalH2>
        <LegalP>
          We may update this Privacy Policy from time to time. Material changes will be communicated through the
          Platform or by email at least 21 days before taking effect. Continued use of the Platform after changes
          take effect constitutes acceptance of the revised Policy.
        </LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>12. Contact Us</LegalH2>
        <LegalP>
          If you have questions or requests regarding this Privacy Policy or your personal information, contact us
          at info@chatandtip.com. If you are located in the European Economic Area or United Kingdom, you also
          have the right to lodge a complaint with your local data protection authority.
        </LegalP>
      </section>
    </LegalPage>
  )
}
