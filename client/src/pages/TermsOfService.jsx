import React from 'react'

export default function TermsOfService() {
  return (
    <div className="p-4 sm:p-8 pb-32 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Terms of Service</h1>
      <div className="text-zinc-400 space-y-6 text-sm leading-relaxed">
        <p className="text-zinc-300 text-xs sm:text-sm">Last updated: {new Date().toLocaleDateString()}</p>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">1. Introduction</h2>
          <p>
            Welcome to Torsongs ("we", "our", or "us"). By using Torsongs, you agree to these Terms of Service.
            Torsongs is a music streaming service that provides Tamil music discovery and streaming functionality.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">2. Nature of Service</h2>
          <p>
            Torsongs provides music discovery, search, and streaming functionality through a Progressive Web App (PWA).
            We do not host any content on our servers. All content is accessed through third-party services.
            The service is available to friends and family for personal, non-commercial use.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">3. Authentication and Access</h2>
          <p>
            Torsongs requires user authentication to access the service. We offer two tiers of access:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Free Users:</strong> Limited to 5 minutes of listening per session</li>
            <li><strong>Registered Users:</strong> Unlimited listening access</li>
          </ul>
          <p className="mt-2">
            Authentication is provided through Clerk, a third-party authentication service. By creating an account,
            you agree to Clerk's terms of service and privacy policy.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">4. No Content Hosting</h2>
          <p>
            Torsongs does not host, store, or distribute any music files. We provide search and indexing services
            that help users discover music available through third-party platforms. All content remains the property
            of their respective copyright holders.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">5. User Responsibilities</h2>
          <p>By using Torsongs, you agree to:</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Use the service for personal, non-commercial purposes only</li>
            <li>Respect the intellectual property rights of content owners</li>
            <li>Comply with all applicable laws and regulations</li>
            <li>Not use the service for any illegal purposes</li>
            <li>Not attempt to circumvent any technical protection measures</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">5. Disclaimer of Warranties</h2>
          <p>
            Torsongs is provided "as is" and "as available" without any warranties, express or implied. 
            We do not guarantee the service will be uninterrupted, error-free, or secure.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Torsongs shall not be liable for any indirect, incidental, 
            special, or consequential damages arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">7. Copyright and DMCA</h2>
          <p>
            Torsongs respects intellectual property rights. If you believe your copyrighted work has been 
            improperly made available through our service, please contact us with detailed information about 
            the alleged infringement. We will respond to valid takedown requests in accordance with applicable laws.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">8. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the service after changes 
            constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">9. Contact</h2>
          <p>
            For questions about these Terms of Service, please contact us through the app.
          </p>
        </section>
      </div>
    </div>
  )
}
