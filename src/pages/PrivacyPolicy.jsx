import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#111B21] text-white">
      <MarketingHeader />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-black text-white mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-500 mb-8">Last updated: July 8, 2026</p>

        <div className="space-y-8 text-sm text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-white mb-2">1. Introduction</h2>
            <p>
              Nyasadesk ("we", "our", or "us") is a team inbox platform operated by Brandfletch.
              This Privacy Policy explains how we collect, use, and protect information when you use
              our service at <a href="https://nyasadesk.com" className="text-[#25D366]">nyasadesk.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">2. Information We Collect</h2>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li><span className="text-white font-medium">Account information</span> — name, email address, and workspace name when you sign up.</li>
              <li><span className="text-white font-medium">Messaging data</span> — messages received and sent through connected channels (WhatsApp, Facebook Messenger, email, website chat) are stored to power your team inbox.</li>
              <li><span className="text-white font-medium">Channel credentials</span> — access tokens and configuration for connected platforms (stored encrypted).</li>
              <li><span className="text-white font-medium">Usage data</span> — basic analytics such as page views and feature usage to improve the product.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">3. How We Use Your Information</h2>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>To provide and operate the Nyasadesk team inbox service.</li>
              <li>To route and display messages from your connected channels.</li>
              <li>To authenticate your team members and manage workspace access.</li>
              <li>To send transactional emails (e.g. password resets, notifications).</li>
              <li>To improve the platform based on usage patterns.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">4. Facebook & WhatsApp Data</h2>
            <p className="mb-2">
              When you connect a Facebook Page or WhatsApp Business account, Nyasadesk receives:
            </p>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>Your Facebook Page name and ID.</li>
              <li>Page access tokens (stored securely, never shared).</li>
              <li>Messages sent to your Page or WhatsApp number by your customers.</li>
            </ul>
            <p className="mt-2">
              We use this data solely to display and respond to messages in your Nyasadesk inbox.
              We do not sell, share, or use this data for advertising purposes.
              We comply with the <a href="https://developers.facebook.com/policy/" target="_blank" rel="noreferrer" className="text-[#25D366]">Facebook Platform Policy</a> and
              the <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noreferrer" className="text-[#25D366]">WhatsApp Business Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">5. Data Sharing</h2>
            <p>We do not sell your personal data. We share data only with:</p>
            <ul className="space-y-2 list-disc list-inside text-gray-400 mt-2">
              <li><span className="text-white font-medium">Supabase</span> — our database and authentication provider.</li>
              <li><span className="text-white font-medium">Meta (Facebook/WhatsApp)</span> — to send messages via their APIs.</li>
              <li><span className="text-white font-medium">Vercel</span> — our hosting provider.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">6. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. You may delete your workspace
              and all associated data at any time by contacting us. Message history is retained for
              up to 12 months unless deleted earlier.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">7. Security</h2>
            <p>
              We use industry-standard security measures including encrypted connections (HTTPS),
              encrypted credential storage, and row-level security on our database. Access tokens
              for connected channels are stored encrypted and never exposed to other users.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="space-y-2 list-disc list-inside text-gray-400 mt-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction or deletion of your data.</li>
              <li>Disconnect any connected channel at any time from Settings.</li>
              <li>Export your conversation history.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">9. Cookies</h2>
            <p>
              We use essential cookies for authentication (session management). We do not use
              tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-2">10. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or want to exercise your data rights,
              contact us at:
            </p>
            <div className="mt-3 bg-[#1a2530] rounded-xl p-4 border border-white/10">
              <p className="font-medium text-white">Brandfletch</p>
              <p className="text-gray-400">Nyasadesk Privacy Team</p>
              <a href="mailto:brandfletchmedia@gmail.com" className="text-[#25D366]">brandfletchmedia@gmail.com</a>
            </div>
          </section>

        </div>

      </div>
      <MarketingFooter />
    </div>
  );
}
