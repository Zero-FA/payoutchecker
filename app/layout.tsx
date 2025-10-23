export const metadata = { title: "Payout Eligibility Checker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50">{children}</body>
    </html>
  );
}
