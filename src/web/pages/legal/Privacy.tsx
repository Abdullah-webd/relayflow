import { LegalLayout, Section, List, OPERATOR, CONTACT_PHONE, CONTACT_TEL } from "./LegalLayout";

const toc = [
  { id: "who", label: "Who we are" },
  { id: "collect", label: "What we collect" },
  { id: "use", label: "How we use it" },
  { id: "ai", label: "AI processing" },
  { id: "sharing", label: "Who we share it with" },
  { id: "retention", label: "How long we keep it" },
  { id: "security", label: "Security" },
  { id: "rights", label: "Your rights" },
  { id: "transfers", label: "International transfers" },
  { id: "cookies", label: "Cookies" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes" },
];

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      toc={toc}
      intro={
        <p>
          RelayFlow connects to your messaging channels so an AI agent can read recent messages, answer your questions, and send messages
          you approve. That means we handle sensitive information. This policy explains exactly what we collect, why, and the choices you have.
        </p>
      }
    >
      <Section id="who" title="Who we are">
        <p>
          RelayFlow (userelayflow.com) is operated by {OPERATOR}, an individual based in Nigeria (“we”, “us”). We are the data controller for
          the personal data described here. You can reach us by phone on{" "}
          <a href={`tel:${CONTACT_TEL}`} className="font-medium text-brand-700">{CONTACT_PHONE}</a>.
        </p>
      </Section>

      <Section id="collect" title="What we collect">
        <List
          items={[
            <><b className="font-medium text-ink-900">Account details:</b> your name (optional), email address, and password (stored only as a one-way hash), plus your time zone.</>,
            <><b className="font-medium text-ink-900">Channel connections:</b> the login sessions or access tokens needed to connect WhatsApp, Telegram and Slack, and the list of groups and channels on those accounts.</>,
            <><b className="font-medium text-ink-900">Messages:</b> recent messages from the groups and channels you connect, including sender names and timestamps, so the agent can answer questions about them.</>,
            <><b className="font-medium text-ink-900">What you create in RelayFlow:</b> your chats with the agent, knowledge-base content you add (FAQs, policies, uploaded documents), scheduled tasks, monitors, auto-reply settings, and a log of auto-replies sent or skipped.</>,
            <><b className="font-medium text-ink-900">Billing:</b> your subscription status and Stripe customer and subscription IDs. Card details are entered on Stripe’s page and never reach our servers.</>,
            <><b className="font-medium text-ink-900">Technical data:</b> IP address, browser details and server logs needed to run and secure the service.</>,
          ]}
        />
      </Section>

      <Section id="use" title="How we use it">
        <List
          items={[
            "To provide RelayFlow: reading and summarizing your recent messages, drafting and sending the messages you approve, running your scheduled tasks, monitors and auto-replies.",
            "To send service emails: sign-in and verification codes, monitor alerts, and scheduled-task results.",
            "To manage your free trial and subscription.",
            "To keep the service secure, prevent abuse, and fix problems.",
          ]}
        />
        <p>
          We don’t sell your data, we don’t use it for advertising, and we don’t use your messages to train AI models. Our legal bases are
          performing our contract with you, your consent (for example, when you connect a channel), and our legitimate interest in running a
          secure service.
        </p>
      </Section>

      <Section id="ai" title="AI processing">
        <p>
          To answer your questions and draft replies, RelayFlow sends the relevant message content, your request, and relevant knowledge-base
          content to our AI provider, DeepSeek, which processes it on our behalf to generate a response. We send only what’s needed for the
          request you make, or for the monitor or auto-reply you’ve switched on. DeepSeek’s servers may be located outside your country,
          including in China.
        </p>
        <p>AI output can be wrong. Nothing the agent drafts is sent without your approval, except auto-replies on the specific groups where you turn them on.</p>
      </Section>

      <Section id="sharing" title="Who we share it with">
        <p>We share data only with service providers that help us run RelayFlow, and only as needed:</p>
        <List
          items={[
            "MongoDB Atlas: database hosting.",
            "Railway: application hosting.",
            "DeepSeek: AI processing, as described above.",
            "Stripe: payments and subscription billing.",
            "Resend: sending service emails.",
            "Google Fonts: serves the website’s fonts, which means your browser requests them from Google.",
            "WhatsApp, Telegram and Slack: the platforms you connect, when RelayFlow reads from or sends to them on your behalf.",
          ]}
        />
        <p>We may also disclose information if the law requires it, or to protect the rights, safety and security of our users or the service.</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <List
          items={[
            "Channel messages are deleted automatically 14 days after they were sent.",
            "Channel sessions and tokens are kept until you disconnect the channel.",
            "Sign-in codes expire after 10 minutes, and sign-in sessions after 30 days.",
            "Account data, chats, knowledge-base content, tasks and monitors are kept while your account exists, or until you delete them or ask us to delete your account.",
            "Billing records are kept as long as the law requires.",
          ]}
        />
      </Section>

      <Section id="security" title="Security">
        <p>
          Channel sessions and tokens are encrypted with AES-256-GCM before they’re stored. Passwords are hashed with bcrypt. All traffic uses
          HTTPS. Slack connects through its official OAuth sign-in, so we never see your Slack password. No system is perfectly secure,
          but we work to protect your data and will notify you as the law requires if a breach affects it.
        </p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          Under the Nigeria Data Protection Act 2023, and the GDPR or UK GDPR where they apply to you, you can ask to access, correct, delete or
          receive a copy of your personal data, object to or restrict how we use it, and withdraw consent at any time. You can disconnect
          channels and delete chats yourself in RelayFlow. For anything else, including deleting your account, contact us on{" "}
          <a href={`tel:${CONTACT_TEL}`} className="font-medium text-brand-700">{CONTACT_PHONE}</a>. We’ll respond within 30 days.
        </p>
        <p>You also have the right to complain to the Nigeria Data Protection Commission, or to your local data protection authority.</p>
      </Section>

      <Section id="transfers" title="International transfers">
        <p>
          Our service providers may process data in other countries, including the United States, the European Union and China. Where the law
          requires it, we rely on appropriate safeguards for these transfers.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          We use one essential cookie to keep you signed in, and your browser’s local storage to remember whether your sidebar is collapsed. We
          don’t use advertising or analytics cookies.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>RelayFlow is for businesses and people aged 18 and over. We don’t knowingly collect data from children.</p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If we make material changes, we’ll update the date at the top and tell you by email or in the app before they take effect.
        </p>
      </Section>
    </LegalLayout>
  );
}
