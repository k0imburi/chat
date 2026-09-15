import { LegalPage, LegalH2, LegalP, LegalUl } from "@/components/legal-page"

export const metadata = {
  title: "Terms and Conditions — ChatAndTip",
  description: "The terms that govern your use of ChatAndTip.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" effectiveDate="2 March 2026">
      <section className="space-y-3">
        <LegalH2>1. Eligibility and Nature of the Platform</LegalH2>
        <LegalP>You must be at least 18 years old to create an account or use the Platform in any capacity, whether as a User or a Creator. By using the Platform, you represent and warrant that you are 18 years of age or older, that you have the legal capacity to enter into these Terms, and that all registration information you submit is accurate and truthful. We may require age or identity verification at any time, including government-issued identification and a live selfie, and may suspend or terminate accounts where verification cannot be confirmed.</LegalP>
        <LegalP>ChatAndTip is a content and creator-engagement platform and does not display personal information of the users or the creators. Specifically, profiles only display information such as date joined, languages spoken, and content posted.</LegalP>
        <LegalP>When signing up, a person registers either an Individual account or an Entity Account on behalf of a business, organization, government body, or other entity. Individual account registration proceeds as described elsewhere in these Terms; Entity Account registration, publishing, verification, and plans are governed by Section 5.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>2. Definitions</LegalH2>
        <LegalUl>
          <li>&quot;User&quot; means any person who registers to view content, follow Creators, send messages, or spend Access Keys, ChatCredits, Sessions, or Tips.</li>
          <li>&quot;Creator&quot; means a User who has been approved to upload content, receive direct messages, host VoiceCall and VideoCall Sessions, and receive Tips.</li>
          <li>&quot;Entity Account&quot; means an account registered by or on behalf of a business, organization, government body, or other entity under Section 5, as distinct from an Individual account.</li>
          <li>&quot;Badge&quot; means the blue, grey, or gold verification indicator issued to an Entity Account upon successful verification under Section 5.1.</li>
          <li>&quot;Content&quot; means any photo, video (including reels), audio, text, caption, comment, or other material uploaded, transmitted, or displayed on the Platform.</li>
          <li>&quot;Access Key&quot; (&quot;Key&quot;) is a virtual item purchased by a User and spent to unlock a Creator&apos;s reply to the User&apos;s first (&quot;IceBreaker&quot;) message in a conversation.</li>
          <li>&quot;ChatCredit&quot; is a virtual item purchased by a User and spent each time a Creator replies to a subsequent message after the initial IceBreaker exchange.</li>
          <li>&quot;VoiceCall Session&quot; and &quot;VideoCall Session&quot; (together, &quot;Sessions&quot;) are virtual items purchased by a User, each representing a 15-minute scheduled call with a Creator.</li>
          <li>&quot;Tip&quot; means a voluntary payment made by a User directly to a Creator using a Pebble, Gem, or Diamond.</li>
          <li>&quot;Virtual Currency&quot; refers collectively to Access Keys, ChatCredits, Sessions, and Tips.</li>
          <li>&quot;Wallet&quot; means the financial account associated with your profile, on which all purchases, balances, and payouts are managed exclusively in-app and on chatandtip.com.</li>
        </LegalUl>
      </section>

      <section className="space-y-3">
        <LegalH2>3. Account Registration</LegalH2>
        <LegalP>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorized use of your account. We reserve the right to refuse registration, suspend, or terminate any account at our discretion, including where we believe these Terms have been violated. Registering, browsing, following Creators, commenting, and replying to comments do not require any Virtual Currency balance; only direct messages beyond the free reply threshold described in Section 8, and Sessions, require a balance.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>4. Creator Accounts and Content</LegalH2>
        <LegalP>Creators may upload Content, communicate with Users via direct message, and host VoiceCall and VideoCall Sessions. Creator&apos;s interactions on the platform are subject to review, including identity and age verification. We may reject, suspend, or revoke an account at any time for violation of these Terms, our Community Guidelines, or applicable law.</LegalP>
        <LegalP>Creators retain ownership of the Content they upload, subject to the license granted to us in Section 13. Creators are solely responsible for ensuring that all Content complies with these Terms, our Community Guidelines, and all applicable laws, and that they hold all necessary rights, consents, and releases (including from any other individuals appearing in the Content) to upload and distribute it. When uploading reels or images, Creators may add a title/caption and description, and may choose where the title/caption is displayed; descriptions may include hashtags, links, and tags of other users.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>5. Entity Accounts</LegalH2>
        <LegalP>The sign-up process supports two distinct paths. Upon choosing to sign up, a person selects whether the account is an Individual account or an Entity account, meaning an account registered on behalf of a business, organization, government body, or other entity (&quot;Entity Account&quot;). If Individual is selected, registration proceeds as described in Section 3. If an Entity Account is selected, registration instead follows this Section 5.</LegalP>
        <div className="space-y-2">
          <h3 className="text-base font-black">5.1 Entity Account Registration</h3>
          <LegalP>Entity Account registration requires the following, in place of the standard registration flow:</LegalP>
          <LegalUl>
            <li>Basic Info: the full business/organization name as captured in official/legal documents; a username; country of origin; physical address; and an official phone number and email address. Once set and the account is operational, changing the registered name requires new verification; attempting to change it displays the message, &quot;Please note changing the name will require new verification.&quot;</li>
            <li>About: a short description of the business, and an optional link to the entity&apos;s website.</li>
            <li>The physical address, official phone number, and official email address are not displayed on the public profile.</li>
            <li>Publishing: the account holder must submit, for verification, (a) the ID or passport of an owner or representative, together with a registration certificate, an Operating License, a Commercial Registry Extract, or an Official Letter from an Agency; and (b) one further supporting document from among: Company TIN or Tax Registration records, a Utility Bill, a Bank Statement, a Trust Deed, Proof of Charitable Status, Business Registration Service records, or Memorandum and Articles of Association.</li>
          </LegalUl>
          <LegalP>Verification of submitted documents can take up to 10 business days. Upon successful verification, an Entity Account receives a badge (blue, grey, or gold) and the account is published.</LegalP>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">5.2 Entity Account Plans</h3>
          <LegalP>Once published, an Entity Account has access to a &quot;Purchase Plan&quot; option. Purchasing a plan is required before the account can reply to direct messages or be approved for callback requests; a published Entity Account will still receive direct messages and callback requests before subscribing, or after a subscription lapses, but cannot act on them until a plan is purchased. Attempting to reply to a direct message or approve a callback request while unsubscribed prompts the account to purchase a plan. Entity Accounts may subscribe monthly or annually, and may upgrade or downgrade their plan at any time.</LegalP>
          <LegalUl>
            <li>Business Plan -- Monthly $35 / Yearly $390: reply to up to 70 direct messages daily, and be requested for up to 20 VoiceCall and VideoCall Sessions combined per day.</li>
            <li>Premium Plan -- Monthly $45 / Yearly $510: reply to unlimited direct messages daily and be booked for unlimited Sessions; includes one free Ad per month.</li>
          </LegalUl>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">5.3 Properties and Limitations of Entity Accounts</h3>
          <LegalUl>
            <li>A Entity Account cannot earn Tips, ChatCredits, or payment for VoiceCall or VideoCall Sessions, and does not display the tip icon in its chatbox.</li>
            <li>A Entity Account cannot top up a Wallet balance; it may only pay for the plans described in Section 5.2.</li>
            <li>A Entity Account may only reply to direct messages sent to it and cannot initiate direct messages to other Users; it cannot book calls and can only be requested for a callback.</li>
            <li>A Entity Account does not receive strikes or fines.</li>
            <li>A Entity Account has a history of activity reflecting subscription and Ad transactions.</li>
            <li>A Entity Account cannot be deleted or deactivated by its holder, and cannot hide or delete comments, though it may write and pin comments. A holder who needs to deactivate or delete an Entity Account must contact support.</li>
          </LegalUl>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">5.4 Messaging with Entity Accounts</h3>
          <LegalP>When a User sends a direct message to an Entity Account, the &quot;Start chatting&quot; prompt in the chatbox displays the disclaimer, &quot;Messaging and calling this account is free.&quot;</LegalP>
          <LegalP>A User&apos;s chatbox, when interacting with an Entity Account, includes an &quot;End Chat&quot; button. Ending the chat notifies the Entity Account, which cannot send further messages to that User; the conversation can only resume once the User sends a new message to the Entity Account.</LegalP>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">5.5 Adding and Switching Accounts</h3>
          <LegalP>An &quot;Add Account&quot; option is available on both Individual and Entity Accounts, allowing a User who is already logged in to sign in to, or sign up for, an additional Individual or Entity Account. Once added, a User may switch between any of their added accounts while logged in.</LegalP>
        </div>
      </section>

      <section className="space-y-3">
        <LegalH2>6. Prohibited Content and Conduct</LegalH2>
        <LegalP>The following are strictly prohibited on the Platform, and violations may result in immediate account termination, forfeiture of unpaid balances, and reporting to law enforcement where required by law:</LegalP>
        <LegalUl>
          <li>Content involving anyone under the age of 18, including content that appears to depict a minor or is presented as depicting a minor.</li>
          <li>Non-consensual content, including content shared without the depicted individual&apos;s consent, and non-consensual intimate imagery.</li>
          <li>Nudity or sexually explicit conduct during Sessions or in direct messages, or any Content that violates our Community Guidelines on nudity and explicit material.</li>
          <li>Content involving violence, exploitation, human trafficking, or coercion.</li>
          <li>Content that infringes another party&apos;s intellectual property or privacy rights.</li>
          <li>Harassment, hate speech, threats, or discriminatory conduct directed at other Users or Creators.</li>
          <li>Solicitation of illegal goods or services, or facilitation of illegal activity.</li>
          <li>Attempts to circumvent the Platform&apos;s payment system, age verification, tipping limits, or moderation systems.</li>
          <li>Impersonation of another person or entity, or providing false identity or age information.</li>
          <li>Sharing personal contact information for the purpose of moving transactions off-Platform to avoid fees.</li>
        </LegalUl>
        <LegalP>A Creator may end a Session at any time if a User violates these prohibitions (including nudity policy violations); the Creator must indicate a reason, and the Session&apos;s value is placed &quot;Under Review&quot; as described in Section 10. Users and Creators can report Content or profiles using the in-app Report function. We use a combination of automated systems and human review to detect violations and reserve the right to remove Content, suspend messaging or Session privileges, or restrict accounts without prior notice.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>7. Direct Messaging</LegalH2>
        <LegalP>Messaging follows a structured flow: a User may send a free introductory (&quot;IceBreaker&quot;) message to a Creator. If the Creator replies, one Access Key is spent to unlock that reply. After the IceBreaker exchange, each further User&apos;s message spends one ChatCredit from their balance. Sending messages and replying to a User&apos;s message costs nothing to the Creator; charges apply only to the Users. A User with no Access Keys or ChatCredits may still sign up, browse, comment, and reply to comments, but will see an &quot;insufficient balance&quot; notice if they attempt to unlock a chat or send messages.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>8. VoiceCall and VideoCall Sessions</LegalH2>
        <div className="space-y-2">
          <h3 className="text-base font-black">8.1 Creator Availability</h3>
          <LegalP>Creators set their own weekly availability, including open days and time blocks, the maximum number of Sessions accepted per day, a minimum 10-minute buffer between consecutive Sessions, and whether they accept VoiceCall Sessions, VideoCall Sessions, or both. Availability is published on the Creator&apos;s public profile; a User sees open slots only after selecting the call or video option on that Creator&apos;s chatbox.</LegalP>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">8.2 Booking, Approval, and Reminders</h3>
          <LegalP>To request a Session, a User must hold the corresponding Session type; if they do not, they will be prompted to purchase one. The User selects an available slot and submits a request, and the Creator is notified in-app and by email. The Creator may approve or decline or suggest an alternate time. If declined, the User is notified that the Creator did not confirm availability and may propose an alternate time to the same or a different Creator. If approved, both parties receive a booking confirmation in-app and by email, and both receive a reminder ten minutes before the scheduled start time. A Creator may suggest an alternate time, which the user may approve or decline.</LegalP>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">8.3 No-Show and Strike Policy</h3>
          <LegalUl>
            <li>If the User does not join or joins late, the Session remains open for the full 15 minutes and the Creator earns the full Session value regardless of User attendance.</li>
            <li>If the Creator does not join within 2 minutes of the scheduled start, the Creator is fined 25% of the Session value.</li>
            <li>If the Creator does not join within 3 minutes of the scheduled start, the User is fully refunded and the Creator receives a strike.</li>
            <li>Each Creator no-show results in a strike, and the Creator is notified in-app and by email. Accumulating 5 strikes results in a 72-hour restriction on the Creator&apos;s ability to make a voicecall or a videocall. The rest of the functions remain untouched.</li>
          </LegalUl>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black">8.4 Ending a Session</h3>
          <LegalP>Either party may end a Session early. A Creator may end a Session at any time to enforce these Terms or our Community Guidelines (for example, in response to a nudity policy violation), and must indicate a reason for doing so; the Session then moves to &quot;Under Review&quot; and its value is held pending our review. A User may end a call without providing reasons for ending it. If a session ends following a policy violation, a user may contact support and raise a complaint. When a voice call or a video call is completed normally, the Session is transferred to the Creator&apos;s balance.</LegalP>
        </div>
      </section>

      <section className="space-y-3">
        <LegalH2>9. Virtual Currency, Tips, and Pricing</LegalH2>
        <LegalP>Access Keys, ChatCredits, Sessions, and Tips are Virtual Currency purchased with real money through the app or chatandtip.com. Pricing is set in the applicable local currency (for example, USD, Rupees, CAD, GBP etc) and may be adjusted by region; current prices are displayed at checkout and are exclusive of mobile-money (e.g., M-PESA) or card transaction charges, which are added at checkout.</LegalP>
        <LegalUl>
          <li>An Access Key and each ChatCredit are purchased together at checkout, subject to a minimum purchase of one Key plus five ChatCredits; Users may purchase additional Keys and ChatCredits above this minimum in increments of one.</li>
          <li>A VoiceCall Session (15 minutes) and a VideoCall Session (15 minutes) are each purchased in increments of one Session; Users may combine purchases of Keys, ChatCredits, VoiceCall Sessions, and VideoCall Sessions in a single checkout.</li>
          <li>Purchased Keys, ChatCredits, and Sessions are credited to the User&apos; account at a value lower than the purchase price, reflecting the Platform&apos;s service fee, and are transferred to a Creator&apos;s Wallet at that same credited value when spent.</li>
          <li>Tips are sent directly to a Creator as a Pebble, Gem, or Diamond. The Creator&apos;s Wallet is credited with a reduced value of each Tip received; the remainder is retained by the Platform to cover fees and transaction charges.</li>
          <li>All purchases of Virtual Currency are final and non-refundable, except as required by applicable law, as expressly stated in these Terms (including Section 8.3).</li>
          <li>We may adjust pricing, credited values, or the availability of any Virtual Currency at any time, with notice where required by law.</li>
        </LegalUl>
        <LegalP>Virtual Currency has no cash value outside the Platform and cannot be redeemed, transferred, sold, or exchanged for real currency by Users. We are not a financial institution, and Virtual Currency is not a deposit, security, or investment.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>10. Creator Payouts</LegalH2>
        <LegalUl>
          <li>Amounts earned by a Creator from Access Keys, ChatCredits, VoiceCall Sessions, and VideoCall Sessions become part of the Creator&apos;s Available Balance (withdrawable) 30 days after being earned, once the earning has &quot;matured.&quot;</li>
          <li>A Creator&apos;s Current Balance includes their Available Balance plus amounts already earned but not yet matured for withdrawal.</li>
          <li>Total Earned reflects the cumulative value of all payouts made to the Creator.</li>
          <li>Lateness fines under Section 8.3 are deducted automatically from the Creator&apos;s Available Balance.</li>
          <li>The minimum payout is $40 (or the local-currency equivalent, which may be adjusted by region).</li>
          <li>The payment requests must made by 20th of every month. Payouts are expected within reflect within 5-7 business days.</li>
          <li>The accumulated fines are deducted from the matured earnings before payouts are made.</li>
          <li>Before receiving any payout, a Creator must upload a valid government-issued ID (front and back) and a verification selfie.</li>
        </LegalUl>
        <LegalP>Session values placed &quot;Under Review&quot; under Section 8.4 are held pending investigation and are not included in Available Balance until the review is resolved. Payouts are subject to identity and tax verification and may be delayed or withheld to investigate suspected fraud, chargebacks, or violations of these Terms.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>11. The Wallet and Payments</LegalH2>
        <LegalP>All financial activity -- including purchases of Virtual Currency, payment method management, and Creator payouts -- takes place exclusively on the app and chatandtip.com. All payments are processed through our third-party payment processors and mobile-money partners (including M-PESA) and card networks. By making a purchase, you agree to the applicable processor&apos;s terms. You are responsible for any taxes associated with your use of the Platform, including, for Creators, income taxes on earnings.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>12. Notifications, Comments, and Interactions</LegalH2>
        <LegalP>The Platform provides in-app and web notifications for activity such as comments, likes, shares, and views involving your account or Content; new direct messages are not shown as notifications and instead appear in your inbox, which indicates unread messages. You may delete individual or multiple notifications. Comments support replies and likes. You are responsible for your own comments and interactions and agree not to use these features to violate Section 6.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>13. License to Content</LegalH2>
        <LegalP>By uploading Content, Creators grant ChatAndTip a worldwide, non-exclusive, royalty-free, sublicensable license to host, store, reproduce, distribute, and display that Content solely for the purpose of operating, promoting, and improving the Platform. This license ends when the Content is deleted from the Platform, except to the extent it has been shared with a User who lawfully retains a copy, or as needed for legal, safety, or backup purposes.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>14. Intellectual Property</LegalH2>
        <LegalP>The Platform, including its software, design, trademarks, and logos, is owned by ChatAndTip or its licensors and is protected by intellectual property laws. You may not copy, modify, distribute, or reverse-engineer any part of the Platform except as expressly permitted.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>15. Termination and Suspension</LegalH2>
        <LegalP>We may suspend or terminate your access to the Platform at any time, with or without notice, for violation of these Terms, suspected fraudulent or illegal activity, accumulation of strikes under Section 8.3, or at our reasonable discretion. You may close your account at any time through Account Settings, which will direct you to the app or chatandtip.com to complete account deletion and any related Wallet matters. Certain provisions of these Terms, including those relating to intellectual property, disclaimers, limitation of liability, and dispute resolution, survive termination.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>16. Disclaimers</LegalH2>
        <LegalP>THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT CONTENT, MESSAGES, OR SESSIONS PROVIDED BY OTHER USERS OR CREATORS WILL MEET YOUR EXPECTATIONS.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>17. Limitation of Liability</LegalH2>
        <LegalP>TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHATANDTIP AND ITS OFFICERS, EMPLOYEES, AND AFFILIATES WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE PLATFORM. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS WILL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>18. Indemnification</LegalH2>
        <LegalP>You agree to indemnify and hold harmless ChatAndTip and its officers, employees, and affiliates from any claims, damages, liabilities, and expenses (including reasonable attorneys&apos; fees) arising from your use of the Platform, your Content, or your violation of these Terms or applicable law.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>19. Dispute Resolution and Governing Law</LegalH2>
        <LegalP>These Terms are governed by regionally applicable laws, without regard to conflict-of-law principles. Any dispute arising from these Terms or your use of the Platform will be resolved through [binding arbitration / the courts located in Regional Jurisdiction]. You and ChatAndTip each waive the right to a jury trial and to participate in a class action, to the extent permitted by law.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>20. Changes to These Terms</LegalH2>
        <LegalP>We may update these Terms from time to time. Material changes will be notified through the Platform or by email at least 21 days before taking effect. Continued use of the Platform after changes take effect constitutes acceptance of the revised Terms.</LegalP>
      </section>

      <section className="space-y-3">
        <LegalH2>21. Contact Us</LegalH2>
        <LegalP>If you have questions about these Terms, contact us at info@chatandtip.com</LegalP>
      </section>
    </LegalPage>
  )
}
