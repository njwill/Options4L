import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function TermsOfService() {
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

        <Card data-testid="card-terms-of-service">
          <CardHeader>
            <CardTitle className="text-3xl">Terms of Service</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: November 27, 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using Options4L ("the Service"), you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">2. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is a trading analysis tool that allows users to upload their trading history (such as Robinhood CSV exports) 
                and view analytics, statistics, and insights about their trading activity. The Service includes features such as:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Options strategy detection and classification</li>
                <li>Position tracking and roll detection</li>
                <li>Profit/loss calculations and win rate statistics</li>
                <li>Data visualization and charts</li>
                <li>Transaction commenting and notes</li>
                <li>Data export capabilities</li>
              </ul>
            </section>

            <section className="bg-muted/50 p-4 rounded-lg border">
              <h2 className="text-xl font-semibold mb-3 text-destructive">3. Important Disclaimer - Not Financial Advice</h2>
              <p className="text-muted-foreground leading-relaxed font-medium">
                OPTIONS4L IS NOT A FINANCIAL ADVISOR, BROKER, OR INVESTMENT ADVISOR.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                The Service is provided for <strong>informational and educational purposes only</strong>. Nothing in the Service constitutes:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground mt-2">
                <li>Investment advice or recommendations</li>
                <li>Financial planning or tax advice</li>
                <li>An offer or solicitation to buy or sell securities</li>
                <li>Professional financial guidance of any kind</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                The analysis, statistics, and visualizations provided are based solely on data you upload and are intended to help you 
                understand your past trading activity. They should not be used as the basis for making investment decisions.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Always consult with a qualified financial advisor before making investment decisions.</strong>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">4. User Responsibilities</h2>
              <p className="text-muted-foreground leading-relaxed">By using the Service, you agree to:</p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>Provide accurate and complete data when uploading trading history</li>
                <li>Maintain the security of your account credentials (NOSTR private key or email access)</li>
                <li>Not use the Service for any unlawful purpose</li>
                <li>Not attempt to interfere with or disrupt the Service</li>
                <li>Not upload malicious files or content</li>
                <li>Comply with all applicable laws and regulations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">5. User Content and Data</h2>
              
              <h3 className="text-lg font-medium mt-4 mb-2">Your Data Ownership</h3>
              <p className="text-muted-foreground leading-relaxed">
                You retain full ownership of all trading data and content you upload to the Service. 
                We do not claim any ownership rights over your data.
              </p>

              <h3 className="text-lg font-medium mt-4 mb-2">License to Provide Service</h3>
              <p className="text-muted-foreground leading-relaxed">
                By uploading data, you grant us a limited license to process, store, and display that data solely for the purpose of providing the Service to you. 
                This license terminates when you delete your data or account.
              </p>

              <h3 className="text-lg font-medium mt-4 mb-2">Data Accuracy</h3>
              <p className="text-muted-foreground leading-relaxed">
                You are responsible for the accuracy of data you upload. The Service processes data as provided and cannot verify its accuracy against external sources.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">6. Accuracy of Analysis</h2>
              <p className="text-muted-foreground leading-relaxed">
                While we strive to provide accurate analysis, the Service may contain errors, bugs, or inaccuracies. 
                The calculations, strategy classifications, and statistics provided are estimates based on the data you upload and our analysis algorithms.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You should independently verify any important calculations, especially for tax or financial reporting purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind</li>
                <li>We disclaim all warranties, express or implied, including merchantability and fitness for a particular purpose</li>
                <li>We are not liable for any trading losses, investment decisions, or financial outcomes</li>
                <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages</li>
                <li>Our total liability shall not exceed the amount you paid for the Service (which is zero for free users)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">8. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify and hold harmless Options4L and its operators from any claims, damages, or expenses 
                arising from your use of the Service, your violation of these Terms, or your violation of any rights of another party.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">9. Service Availability</h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not guarantee that the Service will be available at all times. We may modify, suspend, or discontinue 
                the Service at any time without notice. We are not liable for any modification, suspension, or discontinuation of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">10. Account Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                You may delete your account at any time through the Account Settings page. 
                We reserve the right to suspend or terminate accounts that violate these Terms or for any other reason at our discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">11. Open Source License</h2>
              <p className="text-muted-foreground leading-relaxed">
                Options4L is open source software released under the MIT License. The source code is available at{' '}
                <a href="https://github.com/njwill/Options4L" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  github.com/njwill/Options4L
                </a>.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                The MIT License applies to the software itself. These Terms of Service govern your use of the hosted service at tool.options4l.com.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">12. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may modify these Terms at any time. We will notify users of material changes by updating the "Last updated" date. 
                Continued use of the Service after changes constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">13. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the United States, 
                without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">14. Severability</h2>
              <p className="text-muted-foreground leading-relaxed">
                If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-6 mb-3">15. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about these Terms, please open an issue on our{' '}
                <a href="https://github.com/njwill/Options4L/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  GitHub repository
                </a>.
              </p>
            </section>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground pb-8">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          {' · '}
          <a href="https://github.com/njwill/Options4L" target="_blank" rel="noopener noreferrer" className="hover:underline">
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
