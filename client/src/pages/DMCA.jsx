import React from 'react'

export default function DMCA() {
  return (
    <div className="p-4 sm:p-8 pb-32 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">DMCA & Disclaimer</h1>
      <div className="text-zinc-400 space-y-6 text-sm leading-relaxed">
        <p className="text-zinc-300 text-xs sm:text-sm">Last updated: {new Date().toLocaleDateString()}</p>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">1. Important Disclaimer</h2>
          <p className="text-zinc-300 font-semibold">
            Torsongs does not host any content. All content is accessed through third-party services.
          </p>
          <p>
            Torsongs is a personal hobby project for music discovery and streaming. We do not host, store, 
            or distribute any music files on our servers. All audio content is streamed directly from 
            third-party platforms. Torsongs functions as a search and indexing service only.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">2. No Content Hosting</h2>
          <p>
            Torsongs does not:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Host any music files on our servers</li>
            <li>Store or cache audio content</li>
            <li>Distribute copyrighted material</li>
            <li>Have direct control over third-party content</li>
          </ul>
          <p className="mt-3">
            All content remains the property of their respective copyright holders and is accessed through 
            authorized third-party platforms.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">3. DMCA Compliance</h2>
          <p>
            Torsongs respects intellectual property rights and complies with the Digital Millennium 
            Copyright Act (DMCA). If you believe your copyrighted work has been made available through 
            our service without authorization, please contact us with the following information:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Your physical or electronic signature</li>
            <li>Identification of the copyrighted work claimed to have been infringed</li>
            <li>Identification of the material that is claimed to be infringing</li>
            <li>Your contact information (address, phone number, email)</li>
            <li>A statement of good faith belief that the use is not authorized</li>
            <li>A statement that the information is accurate, under penalty of perjury</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">4. DMCA Takedown Procedure</h2>
          <p>
            Upon receiving a valid DMCA takedown notice, we will:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Promptly remove or disable access to the allegedly infringing content</li>
            <li>Notify the user who posted the content (if applicable)</li>
            <li>Take reasonable steps to prevent recurrence</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">5. Counter-Notification</h2>
          <p>
            If you believe content was removed in error, you may submit a counter-notification. The 
            counter-notification must include:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Your physical or electronic signature</li>
            <li>Identification of the material that was removed</li>
            <li>A statement under penalty of perjury that you have a good faith belief the material was removed in error</li>
            <li>Your contact information</li>
            <li>Consent to jurisdiction in your local federal district court</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">6. Repeat Infringer Policy</h2>
          <p>
            Torsongs reserves the right to terminate access to users who repeatedly infringe copyrights 
            or violate our terms of service.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">7. Third-Party Content</h2>
          <p>
            Torsongs provides access to content through third-party platforms. We are not responsible 
            for the content available on these platforms. Users should ensure they have the right to access 
            and use any content through Torsongs.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">8. User Responsibility</h2>
          <p>
            Users are responsible for ensuring their use of Torsongs complies with applicable laws and 
            copyright regulations. Torsongs is not liable for user actions.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">9. Contact for DMCA Issues</h2>
          <p>
            For DMCA takedown requests or copyright inquiries, please contact us through the app with 
            "DMCA Request" in the subject line.
          </p>
        </section>

        <section>
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">10. Hobby Project Notice</h2>
          <p className="text-zinc-300">
            Torsongs is a personal hobby project and not a commercial service. While we strive to comply 
            with copyright laws, we may not have the resources of a commercial platform. Please contact us 
            directly with any concerns.
          </p>
        </section>
      </div>
    </div>
  )
}
