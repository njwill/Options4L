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
            <p className="text-sm text-muted-foreground">Last updated: December 2, 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L ("we", "our", or "us") operates the Options4L trading analysis tool available at tool.options4l.com. 
                This Privacy Policy explains how we collect, use, and protect your information when you use our service.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is proprietary software. All rights are reserved.
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
                <li><strong>Live Market Data:</strong> Fetch current options prices for your open positions (see Third-Party Services below)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">4. Third-Party Services</h2>
              
              <h3 className="text-lg font-medium mt-4 mb-2">Yahoo Finance (Live Options Pricing)</h3>
              <p className="text-muted-foreground leading-relaxed">
                To display live prices for your open option positions, we send requests to Yahoo Finance's publicly available API. 
                When you view live prices, the following information is sent to Yahoo Finance:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Stock/ETF symbols (e.g., SPY, QQQ, AAPL)</li>
                <li>Option strike prices and expiration dates</li>
                <li>Option type (call or put)</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                This data is sent directly from your browser to Yahoo Finance. We do not store or log these requests on our servers. 
                Yahoo Finance's use of this data is governed by their own privacy policy.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Note:</strong> No personal information, account details, trade quantities, or cost basis is shared with Yahoo Finance—only 
                the option contract identifiers needed to retrieve current market prices.
              </p>

              <h3 className="text-lg font-medium mt-4 mb-2">Anthropic Claude AI (Portfolio Analysis)</h3>
              <p className="text-muted-foreground leading-relaxed">
                For <strong>authenticated users only</strong> who choose to use the AI Portfolio Analysis feature, we send portfolio summary 
                data to Anthropic's Claude AI. This data is routed through Replit AI Integrations, which acts as an intermediary that manages 
                API authentication and connection to Anthropic. This feature is optional and only processes data when you explicitly request an analysis.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Data sent to Anthropic (via Replit) includes:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Aggregated position summaries (underlying symbol, strategy type, expiration date)</li>
                <li>Calculated Greeks (Delta, Gamma, Theta, Vega) for open positions</li>
                <li>Profit/loss amounts and percentages</li>
                <li>Position status (open/closed) and live pricing data when available</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Data NOT sent to Anthropic:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Your email address or NOSTR public key</li>
                <li>Raw transaction history or individual trade details</li>
                <li>Account identifiers or personal information</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Caching and Retention:</strong> AI-generated analysis reports are cached in our database so you can access them 
                across sessions without re-generating. These cached reports are associated with your account. You can generate a new 
                analysis at any time to replace the cached version, and all cached reports are permanently deleted when you delete your account.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Third-Party Data Processing:</strong> Your portfolio data passes through two third parties when using this feature:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li><strong>Replit:</strong> Routes API requests and manages authentication. See{' '}
                  <a href="https://replit.com/site/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Replit's privacy policy
                  </a>.
                </li>
                <li><strong>Anthropic:</strong> Processes requests and generates AI responses. See{' '}
                  <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Anthropic's privacy policy
                  </a>.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">5. Data Storage and Security</h2>
              
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
              <h2 className="text-xl font-semibold mt-6 mb-3">6. Data Sharing</h2>
              <p className="text-muted-foreground leading-relaxed font-medium">
                We do not sell, rent, or share your personal information or trading data with third parties for marketing or advertising purposes.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Your trading data is yours. We will never monetize your data, use it for advertising, or share it with financial institutions or data brokers.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Limited third-party processing:</strong> As described in Section 4, we use third-party services to provide specific features:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Yahoo Finance receives option contract identifiers to provide live pricing</li>
                <li>Anthropic (via Replit) receives aggregated portfolio data to provide AI analysis</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                These services receive only the minimum data necessary to provide their functionality.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>AI Analysis Caching:</strong> Cached AI analysis reports persist in our database until you take action to remove them. 
                You can regenerate an analysis at any time (which replaces the previous cached version), or delete all your data by deleting 
                your account through the Account Settings page. We may also disclose data if required by law (e.g., valid legal process such as a court order).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">7. Your Rights and Choices</h2>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li><strong>Access:</strong> You can view all your data through the application interface</li>
                <li><strong>Export:</strong> You can export your transaction data as CSV at any time</li>
                <li><strong>Deletion:</strong> You can delete individual uploads or request complete account deletion</li>
                <li><strong>Anonymous Use:</strong> You can use the tool without creating an account</li>
                <li><strong>Account Linking:</strong> You can link both NOSTR and email authentication to a single account for flexible login options</li>
              </ul>

              <h3 className="text-lg font-medium mt-4 mb-2">Account Linking and Merging</h3>
              <p className="text-muted-foreground leading-relaxed">
                You may link multiple authentication methods (NOSTR and email) to a single account. If you attempt to link an authentication 
                method that is already associated with a different account, you will be offered the option to merge accounts. Merging transfers 
                all data (transactions, positions, comments) from the existing account to your current account and deletes the old account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">8. Cookies</h2>
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
              <h2 className="text-xl font-semibold mt-6 mb-3">9. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                For authenticated users, we retain your data until you delete it or request account deletion. 
                Server logs are retained for a limited period for security and debugging purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">10. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is not intended for use by individuals under 18 years of age. 
                We do not knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">11. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify users of any material changes by updating the "Last updated" date at the top of this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">12. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about this Privacy Policy or your data, please contact us at nathan@njwilli.com.
              </p>
            </section>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground pb-8">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
