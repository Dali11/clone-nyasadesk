export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-[#111B21] text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black"
            style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}>N</div>
          <div>
            <p className="text-lg font-bold text-white">Nyasadesk</p>
            <p className="text-xs text-gray-500">Data Deletion</p>
          </div>
        </div>

        <h1 className="text-2xl font-black text-white mb-1">Data Deletion Request</h1>
        <p className="text-xs text-gray-500 mb-8">Last updated: July 1, 2026</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section className="bg-[#1a2530] rounded-2xl border border-white/10 p-5">
            <h2 className="text-base font-bold text-white mb-2">How to delete your data</h2>
            <p className="text-gray-400 mb-4">
              If you connected your Facebook account or WhatsApp to Nyasadesk and would like
              your data removed, you can do so in two ways:
            </p>
            <ol className="space-y-3 list-decimal list-inside text-gray-400">
              <li>
                <span className="text-white font-medium">From within Nyasadesk</span> — log in to your account,
                go to <span className="text-[#25D366]">Settings → Channels</span>, and disconnect the channel.
                This removes all stored tokens and configuration immediately.
              </li>
              <li>
                <span className="text-white font-medium">Email us directly</span> — send a deletion request to{" "}
                <a href="mailto:brandfletchmedia@gmail.com" className="text-[#25D366]">brandfletchmedia@gmail.com</a>{" "}
                with the subject line <span className="text-white">"Data Deletion Request"</span>.
                We will delete all your data within 30 days and confirm via email.
              </li>
            </ol>
          </section>

          <section className="bg-[#1a2530] rounded-2xl border border-white/10 p-5">
            <h2 className="text-base font-bold text-white mb-2">What gets deleted</h2>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>Your Facebook Page access tokens</li>
              <li>Your WhatsApp Business credentials</li>
              <li>All conversation and message history linked to your account</li>
              <li>Your workspace profile and team member data</li>
            </ul>
          </section>

          <section className="bg-[#1a2530] rounded-2xl border border-white/10 p-5">
            <h2 className="text-base font-bold text-white mb-2">Contact</h2>
            <p className="text-gray-400">For any data-related questions:</p>
            <a href="mailto:brandfletchmedia@gmail.com" className="text-[#25D366] font-medium mt-1 block">
              brandfletchmedia@gmail.com
            </a>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 text-center text-xs text-gray-600">
          © 2026 Brandfletch · Nyasadesk · All rights reserved
        </div>
      </div>
    </div>
  );
}
