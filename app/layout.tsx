export const metadata = { title: 'Apex PA Payout Checker' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* add className="dark" on <html> if you want forced dark */}
      <body>{children}</body>
    </html>
  );
}
