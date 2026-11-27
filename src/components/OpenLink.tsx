/** "Buka link": opens in a new tab and never passes the referrer or window.opener. */
export default function OpenLink({ href, className = "link text-sm" }: { href: string; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>Buka link ↗</a>;
}
