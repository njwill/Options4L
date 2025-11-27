import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to App
            </Button>
          </Link>
        </div>

        <Card data-testid="card-privacy-policy">
          <CardHeader>
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: November 27, 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L ("we", "our", or "us") operates the Options4L trading analysis tool available at tool.options4l.com. 
                This Privacy Policy explains how we collect, use, and protect your information when you use our service.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is an open-source project licensed under the MIT License. The source code is publicly available at{' '}
                <a href="https://github.com/njwill/Options4L" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  github.com/njwill/Options4L
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">2. Information We Collect</h2>
              
              <h3 className="text-lg font-medium mt-4 mb-2">Account Information</h3>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li><strong>NOSTR Authentication:</strong> Your NOSTR public key (npub) when you choose to authenticate via NOSTR. We never have access to your private key.</li>
                <li><strong>Email Authentication:</strong> Your email address when you choose to authenticate via email magic link.</li>
                <li><strong>Display Name:</strong> An optional display name you may choose to set.</li>
              </ul>

              <h3 className="text-lg font-medium mt-4 mb-2">Trading Data You Upload</h3>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Transaction history from CSV/Excel files you upload (e.g., Robinhood exports)</li>
                <li>This includes: dates, instruments, option details, quantities, prices, and amounts</li>
                <li>Comments and notes you add to transactions and positions</li>
              </ul>

              <h3 className="text-lg font-medium mt-4 mb-2">Technical Information</h3>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Session cookies for authentication</li>
                <li>Basic server logs for security and debugging purposes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li><strong>Provide the Service:</strong> Process and analyze your trading data to generate insights, statistics, and visualizations</li>
                <li><strong>Authentication:</strong> Verify your identity and maintain your session</li>
                <li><strong>Data Persistence:</strong> Store your data so you can access it across sessions (authenticated users only)</li>
                <li><strong>Email Delivery:</strong> Send magic link authentication emails when you choose email login</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">4. Data Storage and Security</h2>
              
              <h3 className="text-lg font-medium mt-4 mb-2">Anonymous Users</h3>
              <p className="text-muted-foreground leading-relaxed">
                If you use Options4L without creating an account, your data is stored only in your browser session and is never sent to our servers for permanent storage. 
                When you close your browser or clear your session, this data is lost.
              </p>

              <h3 className="text-lg font-medium mt-4 mb-2">Authenticated Users</h3>
              <p className="text-muted-foreground leading-relaxed">
                If you create an account (via NOSTR or email), your trading data is stored in our PostgreSQL database. 
                This allows you to access your data across sessions and devices.
              </p>

              <h3 className="text-lg font-medium mt-4 mb-2">Security Measures</h3>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>All data transmission is encrypted via HTTPS/TLS</li>
                <li>We use secure, HTTP-only cookies for session management</li>
                <li>No passwords are stored - we use cryptographic signatures (NOSTR) or time-limited magic links (email)</li>
                <li>Database access is restricted and encrypted</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">5. Data Sharing</h2>
              <p className="text-muted-foreground leading-relaxed font-medium">
                We do not sell, rent, or share your personal information or trading data with third parties.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Your trading data is yours. We will never monetize your data, use it for advertising, or share it with financial institutions, 
                data brokers, or any other third parties.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                The only exception would be if required by law (e.g., valid legal process such as a court order).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">6. Your Rights and Choices</h2>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li><strong>Access:</strong> You can view all your data through the application interface</li>
                <li><strong>Export:</strong> You can export your transaction data as CSV at any time</li>
                <li><strong>Deletion:</strong> You can delete individual uploads or request complete account deletion</li>
                <li><strong>Anonymous Use:</strong> You can use the tool without creating an account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">7. Cookies</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use only essential cookies required for the application to function:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li><strong>Authentication Cookie:</strong> A secure, HTTP-only cookie that maintains your login session</li>
                <li><strong>Theme Preference:</strong> Your light/dark mode preference stored in localStorage</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                We do not use analytics cookies, advertising cookies, or any third-party tracking.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">8. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                For authenticated users, we retain your data until you delete it or request account deletion. 
                Server logs are retained for a limited period for security and debugging purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">9. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is not intended for use by individuals under 18 years of age. 
                We do not knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">10. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify users of any material changes by updating the "Last updated" date at the top of this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">11. Open Source</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is open source software. You can review exactly how your data is handled by examining the source code at{' '}
                <a href="https://github.com/njwill/Options4L" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  github.com/njwill/Options4L
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">12. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about this Privacy Policy or your data, please open an issue on our{' '}
                <a href="https://github.com/njwill/Options4L/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  GitHub repository
                </a>.
              </p>
            </section>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground pb-8">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          {' · '}
          <a href="https://github.com/njwill/Options4L" target="_blank" rel="noopener noreferrer" className="hover:underline">
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
