import React from 'react'

export default function PrivacyPolicy() {
  return (
    <div className="p-4 sm:p-8 pb-32 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Privacy Policy</h1>
      <div className="text-zinc-400 space-y-6 text-sm leading-relaxed">
        <p className="text-zinc-300 text-xs sm:text-sm">Last updated: {new Date().toLocaleDateString()}</p>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">1. Introduction</h2>
          <p>
            Torsongs ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy 
            explains how we handle your information.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
          <p>Torsongs is a hobby project that minimizes data collection:</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>No account registration or personal information required</li>
            <li>No tracking or analytics beyond essential functionality</li>
            <li>No cookies for advertising or tracking purposes</li>
            <li>Search queries are processed locally and not stored</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">3. How We Use Information</h2>
          <p>
            Any information collected is used solely for:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Providing the core service (search, streaming, discovery)</li>
            <li>Improving the user experience</li>
            <li>Technical troubleshooting and maintenance</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">4. Data Storage and Retention</h2>
          <p>
            Torsongs does not store user data on our servers. All data processing happens locally on your device 
            or through third-party services that have their own privacy policies.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">5. Third-Party Services</h2>
          <p>
            Torsongs may use third-party services for music streaming and discovery. These services have their 
            own privacy policies which you should review. We are not responsible for the privacy practices of 
            third-party services.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">6. Cookies</h2>
          <p>
            Torsongs uses minimal cookies only for essential functionality (such as maintaining your session). 
            We do not use cookies for advertising, tracking, or analytics purposes.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">7. Data Security</h2>
          <p>
            While we take reasonable measures to protect the service, please note that Torsongs is a hobby 
            project and may not have enterprise-level security measures. Use at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">8. Your Rights</h2>
          <p>
            Since we don't collect personal information, there is no data to delete or access. However, you can:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Clear your browser cache and cookies at any time</li>
            <li>Stop using the service if you have privacy concerns</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">9. Children's Privacy</h2>
          <p>
            Torsongs is not directed at children under 13. We do not knowingly collect personal information 
            from children under 13.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">10. Changes to Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Continued use of the service after changes 
            constitutes acceptance of the new policy.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">11. Contact</h2>
          <p>
            For privacy-related questions, please contact us through the app.
          </p>
        </section>
      </div>
    </div>
  )
}
