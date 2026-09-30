import { Link } from "react-router-dom";
import { LegalLayout, Section, List, OPERATOR, CONTACT_PHONE, CONTACT_TEL } from "./LegalLayout";
import { PRICE_USD } from "../../lib/pricing";

const toc = [
  { id: "agreement", label: "Agreement" },
  { id: "eligibility", label: "Eligibility and accounts" },
  { id: "service", label: "The service" },
  { id: "channels", label: "Connected channels" },
  { id: "use", label: "Acceptable use" },
  { id: "billing", label: "Free trial and billing" },
  { id: "content", label: "Your content" },
  { id: "ai", label: "AI output" },
  { id: "termination", label: "Suspension and termination" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Limitation of liability" },
  { id: "indemnity", label: "Indemnity" },
  { id: "law", label: "Governing law" },
  { id: "changes", label: "Changes" },
];

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      toc={toc}
      intro={
        <p>
          These terms are the agreement between you and {OPERATOR} for your use of RelayFlow. Please read them carefully. They include
          important limits on our liability.
        </p>
      }
    >
      <Section id="agreement" title="Agreement">
        <p>
          RelayFlow (userelayflow.com) is operated by {OPERATOR}, an individual based in Nigeria (“we”, “us”). By creating an account or using
          RelayFlow, you agree to these Terms and to our{" "}
          <Link to="/privacy" className="font-medium text-brand-700">Privacy Policy</Link>. If you use RelayFlow for a business, you confirm you
          can accept these terms on its behalf.
        </p>
      </Section>

      <Section id="eligibility" title="Eligibility and accounts">
        <List
          items={[
            "You must be at least 18 years old.",
            "Give accurate account information and keep your password secure. You’re responsible for everything that happens under your account.",
            "Tell us promptly if you believe your account has been accessed without permission.",
          ]}
        />
      </Section>

      <Section id="service" title="The service">
        <p>
          RelayFlow is an AI agent that connects to your WhatsApp, Telegram, Slack and Gmail accounts. It can read and summarize recent
          messages, draft and send messages you approve, run scheduled tasks, watch for things with monitors, and send auto-replies from your
          knowledge base on the groups where you enable them.
        </p>
        <p>
          You’re responsible for the messages sent from your accounts through RelayFlow, including approved drafts, scheduled tasks and
          auto-replies you switch on. Review drafts before approving them.
        </p>
      </Section>

      <Section id="channels" title="Connected channels">
        <p>
          WhatsApp, Telegram, Slack and Gmail are third-party services with their own terms, which you must follow. RelayFlow isn’t affiliated
          with or endorsed by Meta, WhatsApp, Telegram, Slack or Google.
        </p>
        <p>
          RelayFlow connects to WhatsApp as a linked device, the way WhatsApp Web does, and signs in to Telegram with your account. These
          platforms may limit or suspend accounts that use third-party tools or send messages they consider spam. You accept that risk, and
          we aren’t responsible for actions those platforms take against your accounts.
        </p>
      </Section>

      <Section id="use" title="Acceptable use">
        <p>You agree not to use RelayFlow to:</p>
        <List
          items={[
            "send spam, bulk unsolicited messages, or messages to people who haven’t agreed to hear from you;",
            "harass, threaten, defraud or deceive anyone, or impersonate another person;",
            "send unlawful, infringing, hateful or sexually explicit content, or content that exploits minors;",
            "access accounts, groups or data you aren’t authorized to access;",
            "break the law, including data protection, consumer protection and anti-spam laws;",
            "interfere with or overload the service, probe its security, or reverse engineer it, except as the law allows;",
            "resell or provide the service to others without our written permission.",
          ]}
        />
      </Section>

      <Section id="billing" title="Free trial and billing">
        <List
          items={[
            "New accounts get one free trial of 1 day, starting when you verify your email. No payment details are needed for the trial. When it ends, access pauses until you subscribe.",
            `RelayFlow Pro costs US$${PRICE_USD} per month, charged in advance through Stripe when you subscribe and on the same date each month after.`,
            "Your subscription renews automatically each month until you cancel. You can cancel anytime in Settings. Cancellation takes effect at the end of the current billing period, and you keep access until then.",
            "Payments are non-refundable, including for partial months, except where the law requires otherwise.",
            "Prices exclude any taxes that may apply. If we change the price, we’ll tell you at least 30 days before it affects your next renewal.",
            "If a payment fails, we may pause your access until it’s resolved.",
          ]}
        />
      </Section>

      <Section id="content" title="Your content">
        <p>
          You keep ownership of your messages, knowledge-base content and everything else you bring to RelayFlow. You give us permission to
          store and process it only as needed to provide and secure the service, as described in the Privacy Policy. You confirm you have the
          right to connect the accounts and share the content you use with RelayFlow.
        </p>
      </Section>

      <Section id="ai" title="AI output">
        <p>
          RelayFlow uses AI, which can make mistakes, miss messages or misunderstand context. Summaries and drafts aren’t professional advice.
          Check anything important before relying on it or approving it for sending.
        </p>
      </Section>

      <Section id="termination" title="Suspension and termination">
        <p>
          You can stop using RelayFlow at any time. We may suspend or close your account if you break these terms, create risk or legal
          exposure for us or others, or don’t pay. Where reasonable, we’ll give you notice first. We may also change or discontinue features,
          and if we stop offering RelayFlow entirely, we’ll give reasonable notice.
        </p>
      </Section>

      <Section id="disclaimers" title="Disclaimers">
        <p>
          RelayFlow is provided “as is” and “as available”. To the extent the law allows, we disclaim all warranties, including
          merchantability, fitness for a particular purpose and non-infringement. We don’t guarantee the service will be uninterrupted or
          error-free, or that connected platforms will remain available.
        </p>
      </Section>

      <Section id="liability" title="Limitation of liability">
        <p>
          To the extent the law allows, we aren’t liable for indirect, incidental, special or consequential damages, or for lost profits,
          revenue, data or goodwill. Our total liability for any claim relating to RelayFlow is limited to the amount you paid us in the 12
          months before the claim, or US$100 if that’s more. Nothing in these terms limits liability that can’t be limited by law.
        </p>
      </Section>

      <Section id="indemnity" title="Indemnity">
        <p>
          You agree to indemnify us against claims, losses and costs arising from your content, the messages sent from your accounts through
          RelayFlow, or your breach of these terms or the law.
        </p>
      </Section>

      <Section id="law" title="Governing law">
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria. Disputes will be handled by the courts of Nigeria, unless the
          law where you live gives you the right to bring a claim there.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p>
          If we make material changes, we’ll update the date at the top and tell you by email or in the app before they take effect. If you
          keep using RelayFlow after that, you accept the new terms. Questions? Call us on{" "}
          <a href={`tel:${CONTACT_TEL}`} className="font-medium text-brand-700">{CONTACT_PHONE}</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
